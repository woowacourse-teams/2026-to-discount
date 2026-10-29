# 203. 오퍼 응답에 링크 출처(linkSource) 칸 추가

추적 이슈: [#203](https://github.com/woowacourse-teams/2026-to-discount/issues/203)
관련: [#171](https://github.com/woowacourse-teams/2026-to-discount/issues/171)(오픈 전 선착순 허브 필터), [#172](https://github.com/woowacourse-teams/2026-to-discount/issues/172)(웹 후속), [#173](https://github.com/woowacourse-teams/2026-to-discount/issues/173)(소진 오퍼 허브)

## 결론

`/api/brands`의 오퍼 항목에 `linkSource` 문자열 칸을 더한다. 영역은 API 하나다(`api/`). 웹 코드는 이 이슈에서 바꾸지 않는다.

| 값 | 뜻 | 만드는 자리 |
|---|---|---|
| `none` | 오퍼 링크 없음(`link`가 `null`) | `Offer.from` |
| `ledger` | 원장 레코드가 자기 링크를 들고 옴 | `Offer.from` |
| `banner` | 배너 오퍼의 행사 링크 | `Offer.from` |
| `filter` | API가 사후에 단 링크(오픈 전 배민 선착순 허브, 소진 오퍼 허브) | `Offer.withLink` |

- `linkSource`는 `link`와 항상 짝이다. `link == null`이면 `none`, 아니면 나머지 셋 중 하나다.
- 추가 칸이라 현재 웹은 깨지지 않는다. 웹은 모르는 칸을 읽지 않는다.
- 값은 응답에서 소문자 문자열이다. 웹이 `fromBanner`를 고칠 때(#172) `linkSource === 'banner'`로 쓸 수 있다.

## 배경

- `FirstComeLinkFilter`가 오픈 시각 전의 배민 선착순 오퍼 `link`를 배짱할인 허브 주소로 채운다(#171).
- 웹 클릭 분석은 `fromBanner: !!offer.link`(`web/src/offerLink.js` 213행)로 배너 유래를 센다. 필터가 단 허브 링크의 클릭도 배너 클릭으로 센다(#172).
- 2026-10-29 사용자 결정: 웹이 허브 주소를 비교하지 않고, API가 응답에 출처를 실어 구조로 구분한다.

코드에서 확인한 현재 상태

- `Offer`(`api/.../offer/Offer.java`)는 `link`와 `fromBanner`를 이미 갖는다. `fromBanner`는 `offerType`이 배너인지에서 오고, `link`가 있다고 배너인 것은 아니다. 원장 오퍼도 `link`를 가질 수 있다(`brands.yml`이 아닌 원장 `link` 칸, 웹 `coupangeatsLink`가 `fromBanner`로 가르는 경우).
- 링크를 바꾸는 자리는 `Offer.withLink` 하나이고, 호출은 `FirstComeLinkFilter.apply` 하나다(`BrandComparisonService` 232행).
- **#173(소진 오퍼를 허브로 보내는 규칙)은 이 브랜치의 `api/src/main`에서 찾지 못했다.** `withLink`의 호출자도 필터 하나뿐이다. 구현이 다른 브랜치에 있는지는 이 세션에서 확인하지 못했다.

## 변경

### 새 enum `LinkSource` (`api/.../offer/LinkSource.java`)

- 값: `NONE`, `LEDGER`, `BANNER`, `FILTER`. JSON으로는 소문자 키(`none`, `ledger`, `banner`, `filter`)다.
- 직렬화는 `Certainty`, `AmountKind`가 쓰는 방식을 그대로 따른다(구현자가 두 클래스의 `@JsonValue` 또는 키 메서드 모양을 보고 맞춘다).
- `Offer.status`처럼 안에서는 enum, 밖에서는 소문자 문자열이다.

### `Offer`

- 레코드 끝(`qualifiers` 뒤)에 `LinkSource linkSource`를 더한다. 끝에 두는 이유는 #155와 같다. 이웃 칸과 타입이 달라 위치 인자 실수를 컴파일이 잡는다.
- `Offer.from`: 아래로 정한다.
  - `r.link() == null` → `NONE`
  - 아니고 배너 오퍼(`fromBanner`)면 → `BANNER`
  - 아니면 → `LEDGER`
- `withLink(String v)`: 이름을 `withFilterLink`로 바꾸고 `linkSource`를 `FILTER`로 단다. 필터가 아닌 호출자가 링크만 바꾸고 출처를 안 바꾸는 길을 없애기 위함이다. 호출자는 `FirstComeLinkFilter` 하나라 고칠 곳이 한 줄이다.
- 나머지 생성자 호출 자리는 다음처럼 맞춘다.

| 자리 | `linkSource` |
|---|---|
| `withDetailFrom` | `this` 값 그대로. `link`를 병합하지 않으므로 출처도 병합하지 않는다 |
| `convergedWith` | `this` 값 그대로 |
| `withFirstComeTier` | `lead.linkSource`. `lead.link`를 쓰는 자리라 출처도 같은 쪽에서 가져온다 |
| `withIsNew` | `this` 값 그대로 |

`withFirstComeTier`가 `link`만 `lead`에서 가져오고 `linkSource`를 `this`에서 가져오면 칸이 서로 어긋난다. 이 변경에서 가장 빠뜨리기 쉬운 자리다. 어긋나면 테스트의 다른 칸은 초록이다.

### `FirstComeLinkFilter`

- `offer.withLink(...)` 호출을 `offer.withFilterLink(...)`로 바꾼다. 조건은 건드리지 않는다.
- 필터 조건 `offer.link() != null`(오퍼 자신의 링크가 먼저)은 `linkSource != NONE`과 같은 뜻이다. 조건은 그대로 두고 바꾸지 않는다.

### 소진 오퍼 허브(#173)

- #173의 규칙이 링크를 허브로 바꿀 때 `withFilterLink`를 쓰면 `linkSource: "filter"`가 자동으로 붙는다. 이 이슈는 그 규칙을 만들지 않는다.
- #173이 이 이슈보다 먼저 병합되면, #173이 `withLink`를 부르고 있을 것이다. 그때는 이 이슈의 구현자가 그 호출도 `withFilterLink`로 바꾼다. 이슈가 병합 순서를 정하지 않으므로 **병합 순서는 열린 질문**이다.
- 이 이슈가 먼저 병합되면, #173 구현자가 `withFilterLink`를 써야 한다는 것을 테스트가 잡아 준다(아래 테스트 6번).

### 계약 파일 `api/src/test/resources/contracts/offer-cases.json`

- `offerKeys`에 `"linkSource"`를 알파벳 자리(`link` 바로 다음)에 더한다.
- `exportKeys`에는 넣지 않는다. 원장 칸이 아니라 API가 계산하는 칸이다. `exportDropped`에도 넣지 않는다.
- 기존 사례 네 곳의 `offer`에 `linkSource`를 더한다. 값은 사례의 `link`와 오퍼 종류로 정한다(`link: null`이면 `none`, 배너 사례면 `banner`, 아니면 `ledger`).
- 사례를 하나 더한다. 오픈 전 배민 선착순이 필터를 거친 응답이다. record에 `link`가 없고 offer에 허브 주소와 `"linkSource": "filter"`가 있다. 합성 픽스처다(ADR-009). 단, 계약 테스트가 필터를 거치는지는 구현자가 `OfferContractTest`를 보고 정한다. 필터가 `BrandComparisonService`에 있어 `Offer.from`만 부르는 계약 테스트에는 `filter` 사례를 넣을 수 없다. 그 경우 사례는 넣지 않고 서비스 수준 테스트(아래 1번)로 박는다.
- 파일 맨 위 `note`에 한 문장을 더한다: `linkSource`(2026-10-29, #203)는 링크의 출처이고 원장 칸이 아니다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 닿는 곳을 짚는다. 문서에는 "응답 필드 묶음"이라는 이름의 번호가 없다. 오퍼 응답 칸이 걸린 곳은 아래로 읽었다.

- **배너 모양(2번):** 닿지 않는다. 배너 칸이 아니라 오퍼 응답에 칸을 더한다. 배너 오퍼는 `Offer.from`에서 `banner`가 될 뿐이다.
- **확실성 판정(1번):** 닿지 않는다. `certainty`는 `linkSource`를 읽지 않는다.
- **행동 이벤트(7번):** 지금은 닿지 않는다. `fromBanner` 속성의 값은 웹이 계산한다. 웹이 `linkSource`로 바꿀 때(#172) `ALLOWED_EVENTS`의 이벤트 이름은 그대로고 속성 값만 달라진다. 대조 스크립트는 이름만 맞댄다.
- **화면에 나가는 글자(6번):** 닿지 않는다. 사용자 화면에 나가는 문구가 없다.
- **저장소 경계와 배포 순서(8번):** 닿는다. 아래 배포 순서를 따른다.
- **같은 묶음의 나머지:**

| 자리 | 이 이슈에 넣나 | 이유 |
|---|---|---|
| `Offer`, `LinkSource`, `FirstComeLinkFilter` | 넣는다 | 이슈 요구사항 |
| `contracts/offer-cases.json` | 넣는다 | 웹이 함께 읽는 계약. `web/src/offerContract.test.js`는 응답 예시 칸이 `offerKeys`와 같은지 본다. 빠지면 웹 `npm test`가 실패한다 |
| 웹 `web/src` | 넣지 않는다 | 웹이 `linkSource`를 읽는 일은 #172의 몫이다. API가 먼저 나가야 한다. `offerContract.test.js`의 첫 검사("웹이 읽는 칸은 API 칸이다")는 `offerKeys`가 늘기만 해서 통과한다 |
| `web/scripts/dev/fixtures/brands.json` | 넣지 않는다 | 개발용 고정 응답이다. 웹이 칸을 읽을 때(#172) 같이 갱신한다. **이 세션은 이 파일의 칸 구성을 열어 보지 않았다** |
| `api/README.md`, `docs/CROSS-REPO-TESTS.md` | 구현자가 확인해 오퍼 칸 목록을 적는 곳이면 넣는다 | `offer-cases`를 언급하는 문서다 |
| tracker, beggars-ops | 넣지 않는다 | `linkSource`는 내보내기 칸이 아니다. 원장과 콘솔을 거치지 않는다 |
| `docs/PROJECT-STRUCTURE.md` | 다시 만든다 | 새 파일 `LinkSource.java`와 (생기면) 새 테스트가 있다. `python scripts/generate_project_structure.py` |

### 배포 순서

1. **API(이 이슈)가 먼저.** 응답에 칸이 늘기만 한다. 현재 웹은 읽지 않으므로 화면은 같다.
2. **운영 응답 확인.** 구현자가 아니라 배포 뒤에 `/api/brands`에서 `linkSource`가 실제로 오는 것을 본다. 오픈 전 배민 선착순이 없는 시각에는 `filter`를 못 본다. 그때는 `none`과 `ledger`와 `banner`가 오는 것만 보고, `filter`는 테스트로 갈음하며 그 사실을 PR에 적는다.
3. **웹(#172).** `fromBanner`를 `linkSource === 'banner'`로 바꾼다. 옛 API 응답에는 칸이 없으므로(`undefined`) 웹이 칸이 없을 때 어떻게 할지는 웹 설계가 정한다. 2026-09-24 사고(웹이 먼저 나가 옛 응답을 읽음)와 같은 모양이라 순서를 못박는다.

## 하지 않는 것

- `fromBanner`와 `link` 칸을 바꾸거나 없애지 않는다. 웹이 읽는다.
- 필터 조건(`FirstComeLinkFilter.apply`의 판정)을 바꾸지 않는다.
- #173의 소진 규칙을 만들지 않는다.
- 웹 코드, 웹 클릭 분석 속성(`fromBanner`)을 바꾸지 않는다. #172다.
- 링크 주소를 보고 출처를 추측하지 않는다(허브 주소 비교). 출처는 링크를 다는 자리에서 정한다.
- `ledger`를 더 쪼개지 않는다(쿠팡이츠 공유 링크, 앱 딥링크 등). 웹이 `coupangeatsLink`에서 링크 모양으로 가르는 길은 그대로 둔다.

## 테스트

기존 파일에 더한다. 새 파일이 생기면 `PROJECT-STRUCTURE.md`를 다시 만든다.

1. **필터가 단 링크** (`BrandComparisonServiceTest`): 오픈 전 시각의 시계로 배민 선착순 원장 오퍼를 비교하면 응답 오퍼의 `link`가 허브 주소이고 `linkSource`가 `filter`다. 이슈 완료 조건 1번이다. 오픈 뒤 시각이면 `link`가 `null`이고 `linkSource`가 `none`이다.
2. **오퍼 자신의 링크** (`BrandComparisonServiceTest`): 원장 레코드가 `link`를 들고 있으면 `linkSource`가 `ledger`이고 `link`가 그대로다. 오픈 전 선착순 배민이어도 필터가 덮지 않으므로 `ledger`다. 이슈 완료 조건 2번이다.
3. **배너 오퍼:** `BannerOffers.of`로 세운 오퍼의 `linkSource`가 `banner`다(`BannerOffers` 테스트 근처).
4. **링크 없음:** `link`가 없는 일반 원장 오퍼의 `linkSource`가 `none`이다.
5. **변환에서 보존** (`OfferConvergenceTest` 또는 `OfferRecordTest`):
   - `withDetailFrom`, `convergedWith`, `withIsNew`를 거쳐도 `linkSource`가 그대로다.
   - `withFirstComeTier`에서 선착순이 대표(`lead`)이고 선착순 `link`가 있으면 결과의 `linkSource`가 선착순 것이다. 상시가 대표면 상시 것이다. `link`와 `linkSource`가 어긋나지 않는다는 한 줄 검사(`link == null`이면 `none`, 아니면 `none`이 아님)를 두 경우에 건다.
   - 재현 확인: `withFirstComeTier`의 `linkSource`를 `this.linkSource`로 바꿔 보면 위 검사가 실패하는지 구현자가 한 번 본다.
6. **짝 검사:** 응답으로 만든 오퍼 전체에서 `link == null`일 때만 `linkSource == none`이다(위 1~5의 오퍼에 같은 단언을 공통 헬퍼로 건다). `link`를 바꾸는 자리가 `withFilterLink` 말고 늘면 이 검사가 어긋남을 잡는다.
7. **JSON 모양** (`OfferContractTest`): 직렬화된 오퍼에 `linkSource` 키가 있고 값이 소문자 문자열이다. 네 값이 각각 직렬화된다.
8. **계약:** `OfferContractTest`가 `offerKeys`와 응답 칸 일치, 값 일치를 통과한다.
9. **웹 계약:** 웹 `npm test`의 `offerContract.test.js`가 통과한다. 두 번째 검사가 응답 예시의 칸과 `offerKeys`의 일치를 보므로, 이 이슈에서 가장 먼저 깨질 수 있는 자리다. **이 세션에서는 돌려 보지 못했다.**
10. **전체:** API 테스트 전체가 통과한다. 위치 인자 생성자를 부르는 곳은 `Offer.java` 안이다. 구현자는 `new Offer(`를 `api/src` 전체에서 찾아 놓친 곳이 없는지 본다.

## 열린 질문

답 없이도 기본안으로 시작할 수 있다.

1. **칸 이름과 값 이름을 `linkSource` / `none`·`ledger`·`banner`·`filter`로 해도 되나?** 기본안은 그대로다. 이슈는 이름을 설계에 맡겼다.
2. **#173이 이 이슈보다 먼저 병합될 수 있나?** 기본안은 이 이슈의 구현자가 그 시점의 `withLink` 호출을 전부 `withFilterLink`로 바꾼다. #173 구현이 어느 브랜치에 있는지는 확인하지 못했다.
3. **`ledger`와 `banner`를 둘 다 두는 것이 맞나?** 이슈의 "원래 링크 / 필터가 단 링크 / 배너" 예시를 따랐다. 웹이 `ledger`와 `banner`를 안 가르면 `fromBanner`와 합쳐도 된다. 기본안은 가른다. 웹 `coupangeatsLink`가 이미 둘을 다르게 다루기 때문이다.
