# 285. 배너 오퍼의 capturedAt이 미래 시각으로 나가는 문제

추적 이슈: [#285](https://github.com/woowacourse-teams/2026-to-discount/issues/285)
관련: [#230](https://github.com/woowacourse-teams/2026-to-discount/issues/230)(홈 리뉴얼 시안이 "11.03 23:59 기준"을 보임)

## 결론

원인은 코드에서 찾았다. 배너 오퍼 전부가 `capturedAt`에 "오늘 23:59:59"를 받는다. 이슈의 추정(날짜만 아는 값을 그날 끝으로 채우는 경로)이 맞다. 다만 이슈의 6건이 모두 배너 오퍼인지는 이 세션에서 운영 응답을 못 봐서 관측하지 못했다(아래 "확인하지 못한 것").

고치는 방향은 셋이다. 영역은 API가 먼저, 웹이 나중이다.

1. **API:** 배너 오퍼의 `capturedAt`을 `null`로 낸다. 실제로 본 시각이 없기 때문이다. 대신 날짜만 아는 값을 담는 칸 `capturedOn`(`yyyy-MM-dd`, 오늘 날짜)을 오퍼 응답에 더한다. 원장 오퍼는 `capturedOn`이 `null`이다. 두 칸 중 하나만 값이 있다.
2. **API:** "같은 칸에서 배너가 원장을 이긴다"는 규칙을 `capturedAt` 문자열 비교에서 떼어 `Offer.preferredOver`에 명시한다. 지금은 23:59:59라는 값이 그 규칙을 암묵적으로 떠받치고 있어서, 값을 고치면 규칙이 깨진다.
3. **웹:** `latestCaptured`가 현재 시각보다 미래인 값을 버린다. 서버가 틀린 값을 다시 내도 화면이 미래 시각을 기준 시각으로 쓰지 않는다.

## 배경: 코드에서 확인한 것

- `api/.../banner/BannerOffers.java` 41행: `LocalDate.now(clock).atTime(23, 59, 59)`를 `today` 문자열로 만들고, 99행 `common()`이 모든 배너 오퍼 레코드에 `.capturedAt(today)`로 넣는다. `Offer.from`(70행)이 이 값을 그대로 응답 `capturedAt`에 싣는다.
- 이 값을 일부러 고른 이유가 주석에 있다(33~40행).
  - 2026-09-03: 날짜만 넣으면 같은 날 찍힌 원장 레코드보다 문자열이 이르다고 읽혀 `Offer.preferredOver`(134행)에서 배너가 졌다. 오늘 등록한 배너가 카드에 안 떴다.
  - 2026-10-14: 지금 시각을 쓰면 매 요청 ETag가 달라 304가 한 번도 안 났다. 그래서 하루 동안 같은 값으로 고정했다.
- 그래서 `capturedAt`에는 두 가지 부담이 걸려 있었다. (a) 배너가 원장을 이기게 하는 정렬 열쇠, (b) 하루 동안 안 변하는 값. 둘 다 "실제로 본 시각"과 상관없는 용도다. 주석은 "웹은 이 값을 최신순 정렬에만 쓴다"고 적는다.
- 웹은 `web/src/filters.js` 289행 `latestCaptured`가 `capturedAt`을 읽는 유일한 자리다(`web/src` 전체 검색, 테스트 제외). 지금 main에서는 `sortValue`의 `recent` 키 하나가 쓴다. "n분 전 확인", "몇 시 기준" 문구는 main에 없고 홈 리뉴얼 시안(#230)이 `latestCaptured`를 그릴 때 쓰려던 것이다.
- `Offer.capturedAt`은 `preferredOver`에서 `.equals`와 `.compareTo`로 쓰이므로 지금은 null이 오면 NPE다. 실제 값을 읽는 api 자리는 `Offer.java` 136~138행 한 곳이다.
- 이슈 요구사항 1의 "손 입력 행", "내보내기" 경로: api 쪽에서 `capturedAt`을 채우는 곳은 `BannerOffers`(배너)와 원장 `OfferRecord`(수집기가 내는 `export.json`) 둘뿐이다. 샘플 `api/src/main/resources/data/export.json`의 값은 `2026-01-01T00:00:00+09:00`이라 미래가 아니다. 수집기와 원장은 이 저장소에 없다(AGENTS.md).

### 확인하지 못한 것

- 이슈의 6건(피자알볼로 쿠팡이츠 7,000 등)이 배너 오퍼인지. 운영 `/api/brands`를 이 세션에서 조회하지 않았다. 6건의 플랫폼은 쿠팡이츠 둘, 배민 셋, 요기요 하나로 모두 배너를 올릴 수 있는 앱이지만 그것만으로 단정하지 않는다.
- 6건이 배너 오퍼라면 활성 배너 전부가 같은 값을 받으므로, 운영에서 배너 오퍼가 6건보다 많은지 적은지도 같이 봐야 한다(적다면 나머지는 원장 오퍼와의 병합에서 졌거나 만료됐을 수 있다).
- 원장 `export.json`에 운영에서도 미래 `capturedAt`이 실려 오는지. 수집기가 날짜만 아는 값을 그날 끝으로 채워 내보내는 경로가 있다면 API 변경으로는 안 고쳐진다. 구현 전에 아래 "구현자가 먼저 할 일" 1번으로 가른다.

## 변경

### API

#### `OfferRecord` / `Offer`

- `OfferRecord`와 `Offer`에 `String capturedOn`을 더한다. 형식은 `yyyy-MM-dd`. 칸 위에 한 줄 주석: "날짜만 아는 관측일. `capturedAt`이 없을 때만 있다".
- `Offer` 레코드 끝에 추가한다(#155, #203과 같은 이유. 이웃 칸과 타입이 같은 문자열이라 위치 인자가 서로 바뀌어도 컴파일이 못 잡으므로, 이 칸을 추가할 때 `new Offer(` 호출 자리를 전부 찾아 맞춘다). `withDetailFrom`, `convergedWith`, `withFirstComeTier`, `withIsNew` 같은 복제 자리는 `this`(`withFirstComeTier`는 `lead`가 아니라 `this`) 값을 그대로 옮긴다. 이 칸은 `link`와 달리 선착순 대표로 바뀌지 않는다.
- `Offer.capturedAt`은 null을 허용한다. `Offer.from`은 `r.capturedAt()`을 그대로 옮긴다(null이면 null).
- 응답에서 `capturedAt`이 null이어도 키는 남긴다(`capturedAt: null`). 키를 빼면 `offerKeys` 계약이 바뀐다.

#### `BannerOffers`

- `common()`에서 `.capturedAt(today)`를 빼고 `.capturedOn(LocalDate.now(clock).toString())`을 넣는다. 사람이 올린 행사에는 수집기가 본 시각이 없다.
- 41~42행의 `today` 문자열을 지운다. 33~40행 주석은 새 이유로 다시 쓴다: 값이 하루 동안 같아 ETag가 유지되는 성질은 `capturedOn`이 이어받는다(날짜는 자정에만 바뀐다).

#### `Offer.preferredOver` (이 변경에서 가장 빠뜨리기 쉬운 자리)

- 같은 확실성 판정 안에서 배너 오퍼가 원장 오퍼를 이기는 규칙을 명시한다. 순서는 이렇게 둔다.
  1. 확정 여부가 다르면 확정이 이긴다(지금 그대로).
  2. `fromBanner`가 다르면 배너가 이긴다(**새 줄**).
  3. 아니면 `capturedAt` 비교, 같으면 금액 비교(지금 그대로).
- 비교는 둘 다 `capturedAt`이 있을 때만 한다. 배너끼리는 `capturedAt`이 둘 다 null이므로 금액 비교로 간다. null 비교로 NPE가 나지 않게 한다.
- 이 줄이 없으면 값을 null로 바꾸는 순간 `preferredOver`가 NPE를 내거나, 2026-09-03 사고(배너가 원장에 짐)가 되살아난다. 이 줄을 두는 이유를 주석에 2026-09-03을 적어 남긴다.
- 지금 동작과 같아지는지: 지금은 배너가 늘 `23:59:59`라 같은 날 원장보다 늘 늦다. 어제 이전 원장은 더 이르다. 배너가 이기는 결과는 같다. 다만 원장 레코드의 `capturedAt`이 미래(내일 이후)이면 지금은 원장이 이긴다. 새 규칙에서는 배너가 이긴다. 원장의 `capturedAt`이 미래인 것이 오류이므로 이 차이는 의도다.

#### 계약 파일 `api/src/test/resources/contracts/offer-cases.json`

- `offerKeys`에 `"capturedOn"`을 더한다(알파벳 자리). `exportKeys`에는 넣지 않는다(원장 칸이 아니라 API가 계산하는 칸). 파일 맨 위 `note`에 한 문장: `capturedOn`(2026-11-03, #285)은 날짜만 아는 관측일이고 원장 칸이 아니다.
- 사례의 `offer`에 `capturedOn: null`을 더한다. 배너 사례가 있으면 `capturedAt: null`, `capturedOn`은 날짜로 둔다.
- `offer-cases.json`에는 `capturedAt`이 열 군데 있다. 구현자는 각각이 원장 사례인지 배너 사례인지 보고 맞춘다. 이 세션은 파일 안을 열어 보지 않았다.

### 웹

- `web/src/filters.js#latestCaptured(offers, now = Date.now())`: `capturedAt`이 `now`보다 미래이면 버린다. 파싱할 수 없는 값도 버린다. 지금은 문자열을 `>`로 비교하는데, 시차(`+09:00`)가 같은 형식에서만 맞는다. 이번에 `Date.parse`로 바꿔 비교한다(미래 판정에 필요).
- 최신순 정렬(`sortValue`의 `recent`)은 배너만 있는 브랜드의 `capturedAt`이 사라져 순서가 바뀐다(아래 열린 질문 1).
- `capturedOn`을 화면에 그리는 일은 이 이슈에서 하지 않는다. 시안(#230)이 정한다.
- 웹이 `now`를 받게 하는 이유는 테스트가 시계를 고정하기 위함이다(`Date.now()`를 직접 부르면 시험이 시각에 의존한다).

### 하지 않는 것

- `Offer.firstSeenAt`, 배너 `startsAt`을 `capturedAt`으로 쓰지 않는다. 배너가 걸린 시각이지 누군가 본 시각이 아니다. "n분 전 확인"에 배너 걸린 시각이 뜨면 확인하지 않은 것을 확인한 것처럼 보인다.
- 요청 시각(`clock.instant()`)을 `capturedAt`에 넣지 않는다. 매 요청 ETag가 달라진다(2026-10-14).
- 수집기와 원장은 고치지 않는다. 구현자가 원장에서도 미래 값이 오는 것을 보면 그때 따로 이슈를 연다.
- 문구(6번 묶음)는 만들지 않는다. "n분 전 확인"류 문구는 개발자가 정한다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 짚은 곳이다.

| 묶음 | 닿나 | 이유 |
|---|---|---|
| 2. 배너 모양 | 닿는다 | `BannerOffers`는 "읽는 쪽"의 일부다. 다만 배너 파일 칸(`banners.yml`, `ops_apply.py`의 `BANNER_SCHEMA`)은 바뀌지 않는다. 오퍼 응답 칸만 바뀐다 |
| 1. 확실성 판정 | 닿지 않는다 | `certainty`는 `capturedAt`을 읽지 않는다. 단, `preferredOver`는 같은 판정 후보를 고르는 자리이므로 `certainty-cases.json`을 읽는 두 테스트(`BannerCertaintyContractTest`, `filters.test.js`)가 계속 초록인지 본다 |
| 7. 행동 이벤트 | 닿지 않는다 | 이벤트에 `capturedAt`이 없다 |
| 6. 글자 | 닿지 않는다 | 화면 문구를 더하지 않는다 |
| 8. 배포 순서 | 닿는다 | 아래 |
| 9. 새 파일 | 닿지 않는다 | 새 파일을 만들지 않는다(테스트는 기존 파일에 더한다). 새 `*.test.js`를 만들게 되면 `web/package.json`의 `test` 명령에 넣는다 |

묶음 표에 "응답 필드" 번호는 없다. 설계 203이 같은 판단을 했다. 오퍼 응답에 칸을 더하는 변경이라 203이 적은 자리를 같이 본다.

| 자리 | 이 이슈에 넣나 | 이유 |
|---|---|---|
| `Offer`, `OfferRecord`, `BannerOffers` | 넣는다 | 원인 자리 |
| `api/src/test/resources/contracts/offer-cases.json` | 넣는다 | 웹이 함께 읽는 계약. 웹 `offerContract.test.js`가 응답 예시 칸과 `offerKeys`를 맞댄다 |
| `web/src/filters.js` | 넣는다 | 미래 시각 방어. 요구사항 2 |
| `web/scripts/dev/fixtures/brands.json` | 구현자가 확인해 넣는다 | 개발용 응답이다. `capturedAt`이 23:59:59인 값이 있으면 같이 고친다. 이 세션은 열어 보지 않았다 |
| `api/README.md`, `docs/CROSS-REPO-TESTS.md` | 구현자가 확인해 칸 목록이 있으면 넣는다 | `offer-cases`를 언급하는 문서다 |
| tracker, beggars-ops | 넣지 않는다 | `capturedOn`은 내보내기 칸이 아니다 |
| `docs/PROJECT-STRUCTURE.md` | 새 파일이 없으면 안 바꾼다 | 구현자가 `python scripts/generate_project_structure.py` 결과가 같은지 본다 |

### 배포 순서

1. **API가 먼저.** 배포 직후 `capturedAt: null`인 오퍼와 새 칸 `capturedOn`이 나간다. **현재 웹은 `capturedAt`이 null이어도 깨지지 않는다.** `latestCaptured`가 `filter(Boolean)`으로 null을 이미 거른다. 다만 위 최신순 변화는 이 시점에 시작된다.
2. 운영 응답 확인(아래 "운영 확인").
3. 웹(`latestCaptured` 방어)은 그 뒤. 웹이 먼저 나가도 옛 응답(23:59:59)이 미래로 걸러져 같은 효과가 나지만, 웹 프리뷰 절차(AGENTS.md, 프리뷰 승인 후 main)를 타므로 API와 웹을 한 PR에 담지 않는다. 구현자는 영역별로 PR을 나눈다(API, 웹).
   - 이 순서가 2026-09-24 사고(웹이 먼저 나가 옛 응답을 읽음)와 다른 점: 이 웹 변경은 새 칸을 읽지 않고 오직 미래 값을 버리기만 한다.

## 테스트

완료 조건 2번(재발 방지)에 해당한다. 기존 파일에 더한다.

### API

1. **배너 오퍼는 `capturedAt`이 없다** (`BannerFieldsTest` 근처, 83행의 `BannerOffers.of` 사용 자리): 활성 배너로 만든 레코드의 `capturedAt`이 `null`이고 `capturedOn`이 시계의 오늘 날짜다. 시계를 오전 09:00으로 고정해 "그날 끝이 아님"을 확인한다.
2. **응답에 미래 시각이 없다** (`BrandComparisonServiceTest`): 시계를 오전으로 고정하고 배너와 원장이 섞인 입력을 비교한다. 모든 오퍼에서 `capturedAt != null`이면 `capturedAt <= clock.instant()`다. 이 단언은 오퍼를 만드는 어느 경로(새 경로 포함)에도 걸리는 구조 검사다. 문구가 아니라 시간 관계를 본다.
   - 재현 확인: `BannerOffers.common`에 `.capturedAt(today)`를 되돌려 넣으면 이 테스트가 실패하는지 구현자가 한 번 본다.
   - 양성 신호(AGENTS.md 1번): 이 테스트는 비교 결과에 배너 오퍼가 실제로 하나 이상 있음을 먼저 단언한다. 오퍼가 0건이라 단언이 비어서 통과하는 일을 막는다.
3. **배너가 원장을 이긴다** (`OfferConvergenceTest`, 52행 근처의 `fromBanner.preferredOver(fromLedger)` 자리): 같은 칸에서 (a) 같은 날 원장 `capturedAt`이 배너 생성 후 시각, (b) 어제 원장, (c) 원장 `capturedAt`이 미래인 경우 모두 배너가 이긴다. 2026-09-03 사고를 박는 테스트다.
4. **null 안전** (`OfferRecordTest`): `capturedAt`이 null인 오퍼 둘을 `preferredOver`에 넣어도 예외가 없고 금액 큰 쪽이 이긴다. 한쪽만 null이어도 예외가 없다.
5. **ETag 안정:** 같은 날 두 번 비교한 결과의 직렬화가 같다(2026-10-14 회귀 방지). 이미 비슷한 테스트가 있으면 거기에 `capturedOn`이 들어간 응답으로 확인한다. 없으면 `BrandControllerTest` 근처에 더한다.
6. **계약:** `OfferContractTest`가 `offerKeys`와 응답 칸 일치를 통과한다.
7. **전체:** API 테스트 전체. `new Offer(`와 `OfferRecord.Builder`를 쓰는 곳을 `api/src` 전체에서 찾아 놓친 곳이 없는지 본다.

### 웹

8. **미래 시각 방어** (`web/src/filters.test.js`): `now`를 고정하고 `latestCaptured`가 (a) 미래 값만 있으면 `null`, (b) 미래와 과거가 섞이면 과거 중 가장 최근, (c) 전부 `null`이면 `null`, (d) 파싱 안 되는 문자열을 버리는 것을 본다. 경계: `now`와 같은 시각은 포함한다.
9. **웹 계약:** `offerContract.test.js`가 통과한다. 이 세션에서는 돌려 보지 못했다.

## 운영 확인 (완료 조건 1번)

이 세션은 운영에 접속하지 않았다. 배포 후 구현자나 담당자가 아래를 한다. 조회 명령과 결과를 PR에 적는다.

- 지금보다 미래인 `capturedAt` 수를 센다.
  - 방법: `/api/brands` 응답의 모든 오퍼 `capturedAt`을 모아 현재 시각과 비교한다. 예시(`jq` 필요):
    `curl -s <운영 주소>/api/brands | jq --arg now "$(date -u +%FT%TZ)" '[.. | objects | select(has("capturedAt")) | select(.capturedAt != null) | select((.capturedAt | fromdateiso8601? // 0) > ($now | fromdateiso8601))] | length'`
  - `+09:00` 오프셋은 `fromdateiso8601`이 못 읽을 수 있다. 안 읽히면 `null`로 빠져 0이 나온다. **0이 나왔다고 곧 없는 것이 아니다**(AGENTS.md 1번). 먼저 같은 명령이 `capturedAt`이 있는 오퍼를 한 건 이상 읽었는지(전체 수를 같이 출력) 확인하고, 읽은 수가 0이면 명령이 틀린 것이다.
- 확인할 값: 미래 `capturedAt` 0건, `capturedAt`이 `null`인 오퍼 수와 `capturedOn`이 있는 오퍼 수가 같음(배너 오퍼 수).
- 위 6건(피자알볼로 쿠팡이츠 등)이 어느 경로에서 왔는지: 응답의 `fromBanner`와 `offerType`으로 가른다.

## 구현자가 먼저 할 일

1. 운영 응답에서 이슈의 6건이 `fromBanner: true`인지 본다. 하나라도 아니면(원장 오퍼인데 23:59:59) 이 설계의 원인 가정이 틀렸다. 구현을 멈추고 이슈에 알린다.
2. `Offer.java`와 `OfferRecord.java`의 `capturedAt` 사용 자리, `new Offer(` 호출 자리를 전수 찾는다.
3. 웹과 API를 영역별 PR로 나눈다. API가 먼저다.

## 열린 질문

답 없이도 기본안으로 시작할 수 있다.

1. **최신순 정렬에서 배너만 있는 브랜드는 어디에 서나?** 지금은 배너가 늘 가장 최근(23:59:59)이라 최신순 맨 위에 선다. 바뀐 뒤 `capturedAt`이 없으면 `latestCaptured`가 `null`이라 맨 뒤로 간다(기준값이 없는 카드는 그 군의 맨 뒤라는 기존 규칙). 기본안은 이 동작이다. 배너가 걸린 브랜드가 "최신"에서 사라지는 것이 의도와 다르면 `capturedOn`을 날짜 시작 시각으로 읽어 정렬에만 쓰도록 웹을 바꾼다. 화면에 "기준 시각"으로는 쓰지 않는다. 결정이 필요하다.
2. **`capturedOn` 대신 `capturedAt`을 날짜만으로 내는 방법은?** 한 칸에 `2026-11-03`과 `2026-11-03T09:10:00+09:00`을 섞으면 웹이 길이로 가르게 된다. 문구가 아니라 구조로 짚는다는 원칙에 어긋나서 칸을 둘로 나눴다. 기본안은 두 칸이다.
3. 원장 오퍼에도 날짜만 아는 값이 있는가. 있으면 같은 `capturedOn` 칸을 쓸 수 있다. 수집기 쪽 확인이 필요하고 이 이슈의 범위 밖이다.
