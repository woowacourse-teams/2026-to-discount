# 203. 오퍼 응답에 링크 출처(linkSource) 칸 추가

추적 이슈: [#203](https://github.com/woowacourse-teams/2026-to-discount/issues/203)
관련: [#171](https://github.com/woowacourse-teams/2026-to-discount/issues/171)(오픈 전 선착순 허브 필터), [#172](https://github.com/woowacourse-teams/2026-to-discount/issues/172)(웹 후속), [#173](https://github.com/woowacourse-teams/2026-to-discount/issues/173)(소진 오퍼 허브, #205로 병합됨)

## 결론

`/api/brands`의 오퍼 항목에 `linkSource` 문자열 칸을 더한다. 영역은 API 하나다(`api/`). 웹 코드는 이 이슈에서 바꾸지 않는다.

값은 네 개다. 이름은 수집 경로(직접 수집, 쿠폰함)와 섞이지 않게 지었다. 그래서 `ledger`, `collected`, `filter`는 쓰지 않는다.

| 값 | 뜻(한 줄 설명) | 만드는 자리 |
|---|---|---|
| `record` | 수집된 링크. 원장 레코드가 자기 링크를 들고 온 경우 | `Offer.from` |
| `banner` | 배너에서 받아온 링크. 배너 오퍼의 행사 링크 | `Offer.from` |
| `added` | 응답에서 추가된 링크. API가 응답을 만들 때 단 링크(오픈 전 배민 선착순 허브, #173의 소진 허브) | `Offer.withFilterLink` |
| `none` | 링크 없음(`link`가 `null`) | `Offer.from` |

- 한 줄 설명은 이 표 그대로 `LinkSource` enum의 값마다 주석으로 둔다.
- `linkSource`는 `link`와 항상 짝이다. `link == null`이면 `none`, 아니면 나머지 셋 중 하나다.
- 추가 칸이라 현재 웹은 깨지지 않는다. 웹은 모르는 칸을 읽지 않는다.
- 값은 응답에서 소문자 문자열이다. 웹이 `fromBanner`를 고칠 때(#172) `linkSource === 'banner'`로 쓸 수 있다. 필터가 단 허브 링크는 `added`라 배너로 세지 않는다.
- `record`는 "원장 레코드(`OfferRecord`)의 `link` 칸"이라는 뜻이다. 수집기가 직접 수집으로 얻었는지 쿠폰함에서 얻었는지는 가르지 않는다.

## 배경

- `FirstComeLinkFilter`가 오픈 시각 전의 배민 선착순 오퍼 `link`를 배짱할인 허브 주소로 채운다(#171). 소진된 배민 선착순도 오픈 시각과 상관없이 허브로 채운다(#173, #205). 둘 다 `Offer.withLink` 호출 한 곳이다.
- 웹 클릭 분석은 `fromBanner: !!offer.link`(`web/src/offerLink.js` 213행)로 배너 유래를 센다. 필터가 단 허브 링크의 클릭도 배너 클릭으로 센다(#172).
- 2026-10-29 사용자 결정: 웹이 허브 주소를 비교하지 않고, API가 응답에 출처를 실어 구조로 구분한다.
- 2026-10-29 사용자 결정(이슈 본문 "결정" 절): 값 네 개를 유지하되 위 표의 뜻에 맞춰 이름을 짓는다.

코드에서 확인한 현재 상태(main `62be0f4` 기준)

- 이 설계 브랜치는 #205보다 앞에서 갈라져 있다. 브랜치의 `api/src/main`에는 소진 허브가 없고, main에는 있다. **구현자는 구현 전에 main을 이 브랜치에 합친다.**
- `Offer`(`api/.../offer/Offer.java`)는 `link`와 `fromBanner`를 이미 갖는다. `fromBanner`는 `offerType`이 배너인지에서 오고, `link`가 있다고 배너인 것은 아니다. 원장 오퍼도 `link`를 가진다.
- 링크를 바꾸는 자리는 `Offer.withLink` 하나이고, 호출은 `FirstComeLinkFilter.apply` 안의 두 줄이다(소진 허브, 오픈 전 허브). 호출자는 `BrandComparisonService`(232행 근처)의 `apply` 한 곳이다.
- 필터는 `platform == baemin`이고 `firstCome`이고 `link == null`일 때만 링크를 바꾼다. 오퍼 자신의 링크가 있으면 건드리지 않는다.

### 쿠팡이츠 오퍼의 링크는 어느 값이 되나

결론: 원장 레코드에 `link`가 있으면 `record`, 없으면 `none`이다. `added`는 되지 않는다.

- `FirstComeLinkFilter`는 `"baemin".equals(offer.platform())`일 때만 링크를 바꾼다. 쿠팡이츠는 대상이 아니다.
- 쿠팡이츠 링크가 원장 수집 때 실리는 경로는 코드와 문서에서 두 개 확인했다.
  - 쿠팡이츠 허브 고정 쿠폰의 앱 링크: `OfferRecord.link` 주석이 "export.json `link`, 2026-10-07"이라고 적는다.
  - 사람 링크: `brands.yml`의 `links.coupangeats`를 수집 쪽이 오퍼의 `link`로 실어 내보낸다([설계 141](141-coupangeats-human-link.md)).
- 두 경로 모두 `OfferRecord.link`로 들어와 `Offer.from`에서 `r.link() != null`이고 배너 오퍼가 아니므로 `record`다.
- **확인하지 못한 것:** 이 저장소의 `api/src/main/resources/data/export.json` 샘플에는 `"link":` 키가 하나도 없다. 그래서 실제 운영 원장에서 쿠팡이츠 오퍼에 `link`가 실려 오는지는 이 세션에서 관측하지 못했다. 위 결론은 코드의 경로(`OfferRecord.link` → `Offer.from`)와 주석, 설계 141에서 읽은 것이다. 구현자는 쿠팡이츠 원장 오퍼에 `link`를 단 테스트(설계 148이 말하는 `BrandComparisonServiceTest`의 쿠팡이츠 링크 테스트 자리)로 `record`를 못박는다.
- 쿠팡이츠 오퍼의 `fromBanner`가 참인 배너 오퍼는 `banner`다. 같은 `coupangeats://`나 `https://share.coupangeats.com/` 주소라도 배너에서 세웠으면 `banner`, 원장이 들고 왔으면 `record`다. 웹 `coupangeatsLink`가 `fromBanner`로 가르던 구분이 응답에서 구조가 된다.

## 변경

### 새 enum `LinkSource` (`api/.../offer/LinkSource.java`)

- 값: `NONE`, `RECORD`, `BANNER`, `ADDED`. JSON으로는 소문자 키(`none`, `record`, `banner`, `added`)다.
- 값마다 위 표의 한 줄 설명을 주석으로 단다.
- 직렬화는 `Certainty`, `AmountKind`가 쓰는 방식을 그대로 따른다(구현자가 두 클래스의 `@JsonValue` 또는 키 메서드 모양을 보고 맞춘다).
- `Offer.status`처럼 안에서는 enum, 밖에서는 소문자 문자열이다.

### `Offer`

- 레코드 끝(`qualifiers` 뒤)에 `LinkSource linkSource`를 더한다. 끝에 두는 이유는 #155와 같다. 이웃 칸과 타입이 달라 위치 인자 실수를 컴파일이 잡는다. 칸 위에 한 줄 설명 주석을 둔다.
- `Offer.from`: 아래로 정한다.
  - `r.link() == null` → `NONE`
  - 아니고 배너 오퍼(`fromBanner`)면 → `BANNER`
  - 아니면 → `RECORD`
- `withLink(String v)`: 이름을 `withFilterLink`로 바꾸고 `linkSource`를 `ADDED`로 단다. 링크만 바꾸고 출처를 안 바꾸는 길을 없애기 위함이다. 이름의 `Filter`는 호출자(`FirstComeLinkFilter`)를 가리키고, 값 이름과는 따로다. 호출은 `FirstComeLinkFilter.apply` 안의 두 줄(소진, 오픈 전)이라 고칠 곳이 두 줄이다.
- 나머지 생성자 호출 자리는 다음처럼 맞춘다.

| 자리 | `linkSource` |
|---|---|
| `withDetailFrom` | `this` 값 그대로. `link`를 병합하지 않으므로 출처도 병합하지 않는다 |
| `convergedWith` | `this` 값 그대로 |
| `withFirstComeTier` | `lead.linkSource`. `lead.link`를 쓰는 자리라 출처도 같은 쪽에서 가져온다 |
| `withIsNew` | `this` 값 그대로 |

`withFirstComeTier`가 `link`만 `lead`에서 가져오고 `linkSource`를 `this`에서 가져오면 칸이 서로 어긋난다. 이 변경에서 가장 빠뜨리기 쉬운 자리다. 어긋나면 테스트의 다른 칸은 초록이다.

### `FirstComeLinkFilter`

- `offer.withLink(...)` 호출 두 곳(소진, 오픈 전)을 `offer.withFilterLink(...)`로 바꾼다. 조건은 건드리지 않는다.
- 필터 조건 `offer.link() != null`(오퍼 자신의 링크가 먼저)은 `linkSource != NONE`과 같은 뜻이다. 조건은 그대로 두고 바꾸지 않는다.
- 클래스 주석에 `added`가 이 필터가 다는 출처라는 한 줄을 더한다.

### 소진 오퍼 허브(#173)

- #173은 #205로 병합됐다. 소진 허브는 `FirstComeLinkFilter.apply`의 `offer.soldOut()` 분기이고 같은 `withLink`를 부른다. 이 이슈가 두 호출을 모두 `withFilterLink`로 바꾸므로 소진 허브도 `linkSource: "added"`가 된다. #173의 규칙은 바꾸지 않는다.
- 소진 허브 분기는 `link == null`일 때만 닿는다. 소진이어도 오퍼 자신의 링크가 있으면 `record`나 `banner`가 남는다.

### 계약 파일 `api/src/test/resources/contracts/offer-cases.json`

- `offerKeys`에 `"linkSource"`를 알파벳 자리(`link` 바로 다음)에 더한다.
- `exportKeys`에는 넣지 않는다. 원장 칸이 아니라 API가 계산하는 칸이다. `exportDropped`에도 넣지 않는다.
- 기존 사례 네 곳의 `offer`에 `linkSource`를 더한다. 값은 사례의 `link`와 오퍼 종류로 정한다(`link: null`이면 `none`, 배너 사례면 `banner`, 아니면 `record`).
- 사례를 하나 더한다. 필터를 거친 응답이다. record에 `link`가 없고 offer에 허브 주소와 `"linkSource": "added"`가 있다. 합성 픽스처다(ADR-009). 단, 계약 테스트가 필터를 거치는지는 구현자가 `OfferContractTest`를 보고 정한다. 필터가 `BrandComparisonService`에 있어 `Offer.from`만 부르는 계약 테스트에는 `added` 사례를 넣을 수 없다. 그 경우 사례는 넣지 않고 서비스 수준 테스트(아래 1번)로 박는다.
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
2. **운영 응답 확인.** 구현자가 아니라 배포 뒤에 `/api/brands`에서 `linkSource`가 실제로 오는 것을 본다. 오픈 전이거나 소진된 배민 선착순이 없는 시각에는 `added`를 못 본다. 그때는 `none`과 `record`와 `banner`가 오는 것만 보고, `added`는 테스트로 갈음하며 그 사실을 PR에 적는다.
3. **웹(#172).** `fromBanner`를 `linkSource === 'banner'`로 바꾼다. 옛 API 응답에는 칸이 없으므로(`undefined`) 웹이 칸이 없을 때 어떻게 할지는 웹 설계가 정한다. 2026-09-24 사고(웹이 먼저 나가 옛 응답을 읽음)와 같은 모양이라 순서를 못박는다.

## 하지 않는 것

- `fromBanner`와 `link` 칸을 바꾸거나 없애지 않는다. 웹이 읽는다.
- 필터 조건(`FirstComeLinkFilter.apply`의 판정)과 #173의 소진 규칙을 바꾸지 않는다.
- 웹 코드, 웹 클릭 분석 속성(`fromBanner`)을 바꾸지 않는다. #172다.
- 링크 주소를 보고 출처를 추측하지 않는다(허브 주소 비교). 출처는 링크를 다는 자리에서 정한다.
- `record`를 더 쪼개지 않는다(쿠팡이츠 공유 링크, 앱 딥링크, 직접 수집과 쿠폰함 등). 웹이 `coupangeatsLink`에서 링크 모양으로 가르는 길은 그대로 둔다.

## 테스트

기존 파일에 더한다. 새 파일이 생기면 `PROJECT-STRUCTURE.md`를 다시 만든다.

1. **응답에서 추가된 링크** (`BrandComparisonServiceTest`): 아래 둘 다 응답 오퍼의 `link`가 허브 주소이고 `linkSource`가 `added`다. 이슈 완료 조건 1번이다.
   - 오픈 전 시각의 시계로 배민 선착순 원장 오퍼를 비교한다. 오픈 뒤 시각이면 `link`가 `null`이고 `linkSource`가 `none`이다.
   - 소진된 배민 선착순 원장 오퍼를 비교한다(#173 경로). 오픈 뒤 시각에서도 `added`다.
2. **수집된 링크** (`BrandComparisonServiceTest`): 원장 레코드가 `link`를 들고 있으면 `linkSource`가 `record`이고 `link`가 그대로다. 오픈 전 선착순 배민이어도, 소진이어도 필터가 덮지 않으므로 `record`다. 이슈 완료 조건 2번이다.
3. **쿠팡이츠 원장 링크:** 원장 쿠팡이츠 오퍼에 `coupangeats://test`나 `https://share.coupangeats.com/test` 같은 임의 값을 달면 `linkSource`가 `record`다(필터 대상이 아님을 박는다).
4. **배너에서 받아온 링크:** `BannerOffers.of`로 세운 오퍼의 `linkSource`가 `banner`다(`BannerOffers` 테스트 근처).
5. **링크 없음:** `link`가 없는 일반 원장 오퍼의 `linkSource`가 `none`이다.
6. **변환에서 보존** (`OfferConvergenceTest` 또는 `OfferRecordTest`):
   - `withDetailFrom`, `convergedWith`, `withIsNew`를 거쳐도 `linkSource`가 그대로다.
   - `withFirstComeTier`에서 선착순이 대표(`lead`)이고 선착순 `link`가 있으면 결과의 `linkSource`가 선착순 것이다. 상시가 대표면 상시 것이다. `link`와 `linkSource`가 어긋나지 않는다는 한 줄 검사(`link == null`이면 `none`, 아니면 `none`이 아님)를 두 경우에 건다.
   - 재현 확인: `withFirstComeTier`의 `linkSource`를 `this.linkSource`로 바꿔 보면 위 검사가 실패하는지 구현자가 한 번 본다.
7. **짝 검사:** 응답으로 만든 오퍼 전체에서 `link == null`일 때만 `linkSource == none`이다(위 1~6의 오퍼에 같은 단언을 공통 헬퍼로 건다). `link`를 바꾸는 자리가 `withFilterLink` 말고 늘면 이 검사가 어긋남을 잡는다.
8. **JSON 모양** (`OfferContractTest`): 직렬화된 오퍼에 `linkSource` 키가 있고 값이 소문자 문자열이다. 네 값이 각각 직렬화된다.
9. **계약:** `OfferContractTest`가 `offerKeys`와 응답 칸 일치, 값 일치를 통과한다.
10. **웹 계약:** 웹 `npm test`의 `offerContract.test.js`가 통과한다. 두 번째 검사가 응답 예시의 칸과 `offerKeys`의 일치를 보므로, 이 이슈에서 가장 먼저 깨질 수 있는 자리다. **이 세션에서는 돌려 보지 못했다.**
11. **전체:** API 테스트 전체가 통과한다. 위치 인자 생성자를 부르는 곳은 `Offer.java` 안이다. 구현자는 `new Offer(`를 `api/src` 전체에서 찾아 놓친 곳이 없는지 본다.

## 열린 질문

답 없이도 기본안으로 시작할 수 있다.

1. **칸 이름 `linkSource`와 값 이름 `none`·`record`·`banner`·`added`로 해도 되나?** 이슈 결정은 뜻만 정했고 이름은 설계에 맡겼다. `ledger`는 수집 경로처럼 읽혀서 버렸고, `collected`·`filter`도 같은 이유와 호출자 이름과의 혼동으로 버렸다. 기본안은 그대로다. 다른 이름을 원하면 `LinkSource`와 계약 파일만 바뀐다.

## 변경 이력

- 2026-10-29: 다시 설계 실행. 이슈 입력(`issue-input.md`)의 "댓글 (OWNER, MEMBER, COLLABORATOR만)" 절이 비어 있었다. 권한자 댓글과 `인계:` 댓글이 없어 반영할 지시가 없다. 설계 내용은 바꾸지 않았다.
- 2026-10-29: 이슈 본문의 "결정 (2026-10-29, 사용자)" 절에 맞춰 다시 설계했다.
  - 값 이름 변경: `ledger`→`record`, `filter`→`added`. `ledger`는 수집 경로로 읽혀서, `filter`는 호출자 이름이어서 바꿨다. `none`·`banner`는 그대로다. 값마다 한 줄 설명을 문서(결론 표)와 코드 주석(`LinkSource`)에 두기로 했다.
  - 쿠팡이츠: 필터 대상이 아니며 원장 `link`가 있으면 `record`, 없으면 `none`임을 적었다. 경로는 코드 주석과 설계 141에서 읽었고, 샘플 `export.json`에는 `link`가 없어 운영 원장 관측은 못 했음을 적었다.
  - #173: 병합(#205)됨을 반영했다. 병합 순서 열린 질문을 지웠다. 소진 허브도 같은 `withFilterLink`를 써서 `added`가 된다. 호출 두 줄을 바꾼다. 테스트에 소진 사례와 쿠팡이츠 사례를 더했다.
  - 이 브랜치가 #205 앞에서 갈라져 있어 구현 전에 main을 합친다고 적었다.
  - 열린 질문 3(`ledger`/`banner` 구분)은 사용자가 네 값 유지를 정해 지웠다.
