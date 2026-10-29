# 164. 받아 둔 쿠폰 낮춤 상태 (API, 웹, 문구)

추적 이슈: [#164](https://github.com/woowacourse-teams/2026-to-discount/issues/164)
출처: nn98/delivery-discount-tracker#47 (이슈 #46)의 후속. 이 세션은 출처 PR과 tracker 코드를 읽지 못했다(비공개 저장소, ADR-002). 출처 PR의 내용은 이슈 본문에 적힌 만큼만 안다.

## 결론

행사가 끝난 쿠팡이츠 쿠폰이 쿠폰함에만 남아 있으면 오퍼를 내리지 않고 **"받아 둔 쿠폰"으로 낮춰** 보인다. 낮추는 뜻은 셋이다: 최고 할인과 정렬에 끼지 않는다, 같은 앱에 살아 있는 오퍼가 있으면 그쪽이 선다, 눈으로 구분된다.

- **API:** 별도 목록이 아니라 **오퍼 항목에 불리언 칸 `receivedOnly`를 더한다.** 영역은 `api/` 하나다.
- **웹:** 카드 머리 배지 "받아 둔 쿠폰"(문구 후보 A)과 회색 쿠폰 모양. 카드 안 순서는 맨 뒤. 최고 후보, 신규 표시, 정렬 천장에서 뺀다.
- **문구:** 후보를 아래에 적었다. **사용자 승인 전이다.** 구현은 승인을 받은 문구로 한다(`docs/COPY-STYLE.md` §3).
- **tracker:** 칸을 내보내는 일은 비공개 저장소의 몫이다. 이 문서는 칸 이름과 뜻만 정하고 후속 이슈로 넘긴다.

**확인하지 못한 것:**
- tracker가 낮춘 쿠폰을 어떤 칸으로 내보낼지는 정해진 것이 없다. `receivedOnly`는 이 문서의 제안이다. tracker 이슈에서 같은 이름과 뜻으로 합의해야 한다.
- 운영 `export.json`에 쿠폰함 잔존 쿠폰이 지금 몇 건인지 보지 못했다.

## 배경

코드에서 확인한 현재 상태

- `Offer`(`api/.../offer/Offer.java`)는 `status`(CONFIRMED, HELD)를 JSON으로 내보내지만 뜻이 다르다. `HELD`는 금액이 없거나 재확인이 필요한 오퍼다(`OfferRecord.status()`는 `amount != null && !needsReview`). 받아 둔 쿠폰은 금액이 있고 쿠폰도 실재하므로 `HELD`로 재사용하지 않는다. 재사용하면 `maxHeld`와 웹 `offer--held` 스타일이 의미 없이 섞인다.
- 최고 후보 판정은 API `OfferComparison.isBestCandidate`와 `comparisonAmount`, 웹 `filters.js`의 `comparableAxes`가 같은 규칙으로 들고 있다. 알림 대상(`NewOfferNotificationService.eligible`)도 `isBestCandidate`를 부른다.
- 같은 (브랜드, 앱) 칸은 `BrandComparisonService`의 `slot`(`platform`, `#random`, `#first-come`)으로 갈리고 웹 `offerKey`가 같은 규칙을 쓴다.
- 웹 카드는 `splitOffers`(`web/src/couponModel.js`)가 최고와 나머지를 가르고, 칩은 `chipsOf`와 `CHIP_PLACEMENT`가 정한다. 360px에서 머리 줄은 넘치면 뒤가 잘린다(`HEAD_ORDER` 주석).

## 비교: API 응답에 어떻게 싣나

| | A. 오퍼에 `receivedOnly` 칸 | B. 브랜드에 별도 목록 `receivedOffers` |
|---|---|---|
| 웹이 읽는 곳 | `brand.offers`를 읽는 기존 코드가 그대로 받는다. 칸을 읽는 자리만 더한다 | `offers`를 읽는 자리마다 두 목록을 합쳐야 한다(필터, 검색, 노출 계측, 카드 수 판정, 브랜드 카드 숨김) |
| 같은 앱 중복 | `preferredOver` 한 곳에서 "살아 있는 쪽이 이긴다"로 푼다 | 두 목록 사이의 중복을 따로 풀어야 한다 |
| 빠뜨렸을 때 | 칸을 안 읽는 옛 웹은 받아 둔 쿠폰을 정상 오퍼처럼 보인다(아래 배포 순서) | 옛 웹은 새 목록을 모르니 아무것도 안 보인다. 안전하게 빠진다 |
| 계약 파일 | `offerKeys`에 칸 하나 | 브랜드 응답 키 하나와 오퍼 모양 둘 |
| 변경 증폭 | 작다 | 크다 |

**A로 한다.** B의 장점은 옛 웹이 안전하게 빠진다는 하나뿐이고 배포 순서(API 먼저, 웹 나중)로 막을 수 있다. 그 구간에 대한 방어는 "배포 순서"와 "tracker 내보내기 시점"에 둔다.

## API

### `OfferRecord`

- 정식 생성자 끝에 `Boolean receivedOnly`를 더한다(`qualifiers` 뒤, #155와 같은 이유로 끝에 둔다). 빌더에 `receivedOnly(Boolean v)`를 더한다.
- 키가 없는 옛 행은 `null`이다. `null`과 `false`는 같게 읽는다("낮추지 않는다"). 이 칸만은 "모름"과 "아님"을 가를 이유가 없다. 모르면 기존 동작(정상 오퍼)이 곧 안전한 쪽이기 때문이다.
- 클래스 주석의 "칸이 N개" 문구가 있으면 맞춘다(#155 후 22개, 이 변경 후 23개). 구현자가 실제 개수를 센다.

### `Offer`

- 레코드 끝(`qualifiers` 뒤)에 `boolean receivedOnly`를 더한다. JSON 이름은 `receivedOnly`. 기본은 `false`, `Offer.from`은 `Boolean.TRUE.equals(r.receivedOnly())`로 넘긴다(`soldOut`과 같은 모양).
- 생성자를 위치 인자로 부르는 곳(`from`, `withDetailFrom`, `convergedWith`, `withFirstComeTier`, `withLink`, `withIsNew`)은 `this.receivedOnly`를 그대로 넘긴다. `withFirstComeTier`는 아래 규칙으로 막는다.
- `BannerOffers.common`은 이 칸을 설정하지 않는다(`null`). 배너는 행사 중인 오퍼다.

### 중복 합치기

같은 슬롯에서 받아 둔 쿠폰과 살아 있는 오퍼가 만나면 **살아 있는 쪽이 이긴다.** 금액이 커도, 캡처가 더 최근이어도 그렇다. 쿠폰함의 5,000원이 허브의 3,000원을 이기면, 끝난 행사가 최고 할인으로 서는 원래 문제가 돌아온다.

- `preferredOver`: `thisWins` 판정 맨 앞에 `receivedOnly`가 다르면 `!receivedOnly`인 쪽이 이기는 조건을 둔다. 둘 다 받아 둔 쿠폰이거나 둘 다 아니면 기존 규칙이다.
- `withDetailFrom`: 기존 `sameCoupon`(금액이 같거나 한쪽이 모름) 규칙을 그대로 따른다. 진 쪽이 받아 둔 쿠폰이어도 금액이 같으면 같은 쿠폰이라 상세를 채워도 된다. 이긴 쪽의 `receivedOnly`는 바꾸지 않는다.
- `convergedWith`: 진 쪽이 `receivedOnly`면 `return this`를 맨 앞에 더한다. 안 막으면 끝난 쿠폰이 살아 있는 오퍼의 택일 사다리에 한 단으로 끼어 "받을 수 있는 구간"처럼 보인다(ADR-019와 같은 종류의 오류).
- `withFirstComeTier`: 선착순 오퍼가 `receivedOnly`일 수 있는 경로는 없다(선착순은 배너나 허브 구역에서 온다). 방어로 `first.receivedOnly`면 `null`(붙이지 않음)을 돌려준다.
- **같이 고칠 자리:** `withDetailFrom` 끝의 "바뀐 게 없으면 `this`" 조건은 `receivedOnly`를 바꾸지 않으므로 건드리지 않는다.

받아 둔 쿠폰끼리 같은 슬롯이면 기존 `preferredOver` 규칙대로 하나만 남는다. 슬롯을 따로 만들지 않는다(아래 열린 질문 1).

### 견주기와 정렬 (확실성 판정, 전파 1번)

`OfferComparison`의 `comparable`에 `receivedOnly`를 더한다. `isBestCandidate`와 `comparisonAmount`가 모두 이 함수를 거치므로 한 곳을 고치면 둘 다 받는다.

- `isBestCandidate(certainty, kind, soldOut, platform, receivedOnly)`
- `comparisonAmount(certainty, kind, soldOut, platform, amount, confirmed, receivedOnly)`: 받아 둔 쿠폰은 `null`. 1+1 묶음 분기(맨 앞 `if`)도 받아 둔 쿠폰이면 타지 않게 순서를 맞춘다.
- 호출부 셋을 맞춘다: `BrandComparisonService`(`maxConfirmed`와 `maxHeld`에 안 들어간다), `NewOfferNotificationService.eligible`(신규 알림 대상에서 빠진다), 계약 테스트.
- 받아 둔 쿠폰뿐인 브랜드는 `maxConfirmed`와 `maxHeld`가 둘 다 `null`이다. `BrandComparison.byBestDiscount`에서 확정이 없는 군의 금액 0으로 뒤에 선다. 구현자가 이 정렬을 테스트로 박는다.

### 신규 표시

`BrandComparisonService`가 `withIsNew`를 다는 자리에서 `receivedOnly`면 `isNew`를 `null`로 둔다. 이미 가진 쿠폰을 "신규 할인"이라 부르면 안 된다. 웹 `isUpdated`는 `isNew in offer`일 때 `=== true`만 신규로 치므로 `null`이면 신규가 아니다.

### 계약 파일

- `contracts/offer-cases.json`: `offerKeys`와 `exportKeys`에 `"receivedOnly"`를 더한다. 기존 사례의 `offer`에 `"receivedOnly": false`를 더한다. 사례 하나를 더한다: record `"receivedOnly": true`, offer `true`(합성 픽스처, ADR-009). `note`에 한 문장 더한다.
- `contracts/certainty-cases.json`: 30행 전수 표(certainty 5 × kind 3 × soldOut 2)에는 축을 더하지 않는다. 더하면 60행이 되고 표의 요점(빈 칸 없이 채움)이 무거워진다. 대신 같은 파일에 `receivedOnlyCases` 배열을 따로 두고 Java 테스트(`OfferComparisonTest`)와 JS 테스트(`filters.test.js`)가 함께 읽는다. 행은 넷이면 된다: 확정 할인 `exact/discount/품절 아님` 하나가 `receivedOnly`일 때 `best: false, sorting`은 `null`, 같은 조건에서 `receivedOnly: false`일 때 `best: true`, `menuOnly`와 `bundle` 하나씩이 받아 둔 쿠폰일 때 모두 정렬에서 빠진다.
  - `sorting` 열은 `sortingAmount`(확실성만 보는 함수)의 값이라 `receivedOnly`에 영향을 받지 않는다. 새 배열의 열은 `best`와 `comparison`(천장 기여액)으로 한다. 구현자가 기존 테스트가 읽는 열 이름을 확인해 맞춘다.

## 웹

### 표시 위치와 순서 (360px 기준)

| 자리 | 받아 둔 쿠폰 |
|---|---|
| 카드 대표 쿠폰 | 살아 있는 오퍼가 있으면 대표가 되지 않는다. 받아 둔 쿠폰뿐인 브랜드만 대표로 선다 |
| 카드 머리 배지 줄 | 배지 "받아 둔 쿠폰"을 **맨 앞**에 둔다. 360px에서 머리 줄은 뒤가 잘리므로 가장 중요한 표식이 앞이어야 한다 |
| 접힌 카드의 하위 줄(`cc-alts`) | 넣지 않는다. 폭이 좁아 글자를 붙일 수 없고, 글자 없이 모양만 다르면 색에만 기대게 된다. 접힌 카드에서는 받아 둔 쿠폰을 말하지 않는다 |
| 펼친 영역, 하단 시트 | 살아 있는 오퍼 **뒤에** 선다. 쿠폰은 회색(`offer--capped`와 같은 계열의 물러난 색)이고 머리에 같은 배지가 붙는다 |
| 최고 표시, 신규 표시 | 붙지 않는다 |
| 링크 | 눌러서 앱으로 가는 것은 그대로다. 쿠폰함에는 실제로 있기 때문이다. 쿠팡이츠 안내 문구(`COUPANGEATS_HINT`)도 그대로 나온다 |
| 정렬(브랜드 순서) | 받아 둔 쿠폰은 천장에 기여하지 않는다. 그 쿠폰뿐인 브랜드는 확정 없는 군으로 뒤에 선다 |

구분은 색만으로 하지 않는다. 배지 글자가 있고, 하단 시트와 펼친 영역에서 쿠폰이 회색이다. 접힌 카드의 하위 줄은 글자를 넣을 수 없어 아예 뺀다.

### 코드 변경

- `web/src/filters.js`: `comparableAxes`에 `!offer.receivedOnly`를 더한다(API `OfferComparison.comparable`과 같은 축). `comparisonAmount`의 묶음 행사 분기도 같은 조건을 건다.
- `web/src/couponModel.js`:
  - `splitOffers`: 받아 둔 쿠폰을 먼저 가려 `received` 목록으로 따로 둔다. 살아 있는 오퍼가 하나라도 있으면 `rest` 뒤에 붙고, `best`와 대표 선택에 끼지 않는다. 살아 있는 오퍼가 없으면 `received`의 첫 쿠폰이 대표다(대표 쿠폰 자리가 비면 카드가 안 그려지는 기존 제약, 묶음 행사 분기와 같은 이유).
  - `chipsOf`, `CHIP_PLACEMENT`: 칩 종류 `received`를 더한다. `{ card: 'head', detail: 'head' }`.
  - `HEAD_ORDER`의 맨 앞에 `received`를 둔다.
- `web/src/CouponCard.jsx`: `OpBadge`가 `received`를 그린다. 클래스는 기존 `offer__range-badge--plain`을 재사용하고 새 클래스를 만들지 않는다. `cc-alts`는 `received`를 거른다. 쿠폰 모양은 `cc-ticket` 옆에 상태 클래스를 달고 `coupon-card.css`에서 물러난 색으로 칠한다.
- `web/src/OfferChip.jsx`(운영 카드 경로): `capped` 판정에 `|| offer.receivedOnly`를 더해 같은 회색을 받고, 배지는 `badgesOf`가 `received`를 내면 그린다. 이 경로가 아직 쓰이는지는 구현자가 `App.jsx`에서 확인하고, 안 쓰이면 건드리지 않는다.
- `web/src/offerLink.js` `offerClickProps`: `received: !!offer.receivedOnly`를 더한다. 이벤트 이름은 늘지 않아 `ALLOWED_EVENTS`(`EventController`)는 그대로다. 단 서버가 속성을 앞에서부터 `MAX_PROPS`까지만 남기므로(코드 주석) 새 속성이 잘리는지 구현자가 확인하고, 잘리면 `position` 뒤가 아니라 뒤쪽에 둔다. 계측은 한 줄이라 포함한다.
- `web/src/surveyQuestions.js` 등 다른 파일의 "쿠폰"은 무관하다.

### 테스트

- `filters.test.js`: `receivedOnlyCases`를 API와 같이 읽는다. `web/package.json`의 `test`에는 이미 들어 있는 파일이라 명령 변경은 없다.
- `couponModel.test.js`: `splitOffers`가 (a) 살아 있는 오퍼 + 받아 둔 쿠폰에서 받아 둔 쿠폰을 `best`와 `rest` 앞에 올리지 않음, (b) 받아 둔 쿠폰뿐일 때 그것이 대표, (c) 받아 둔 쿠폰이 금액이 더 커도 `best`가 아님을 박는다. `chipsOf`가 `received`를 내고 `headOrder`가 맨 앞에 두는 것도 박는다.
- `offerContract.test.js`: `offerKeys`에 `receivedOnly`가 있어야 통과한다. API가 먼저 나가야 하는 이유다.
- 360px 스크린샷(받아 둔 쿠폰이 있는 카드, 뿐인 카드, 하단 시트)은 웹 구현 PR의 몫이다. 그 PR이 프리뷰 절차(`docs/WORKFLOW.md` §3-3)를 따른다.
- 새 `*.test.js`는 만들지 않는다.

## 문구 후보 (사용자 승인 필요)

`docs/COPY-STYLE.md` §1을 따른다: 명사구, 문장 아님, 수집기 말(관측, 확인, 미확인 등)과 근거 설명 없음, 45자 이내, 좁은 배지 폭.

| | 문구 | 길이 | 비고 |
|---|---|---|---|
| **A (권장)** | 받아 둔 쿠폰 | 6자 | 이슈가 정한 이름. 앱이 쿠폰함에 쓰는 말과 가깝다. 배지로 쓸 만큼 짧다 |
| B | 쿠폰함 쿠폰 | 6자 | "받아 둔"보다 위치가 분명하다. 앱을 안 쓰는 사람에게는 쿠폰함이 낯설 수 있다 |
| C | 보유 쿠폰 | 5자 | 가장 짧다. 앱 말투가 아니라 서비스 말투에 가깝다 |

쓰지 않는 말: "행사 종료"와 "종료된 쿠폰". 수집이 아는 것은 허브에 없다는 사실뿐이고, 행사가 끝났다고 단정하면 틀릴 수 있다(원칙 5: 모르면 단정하지 않는다). "만료 임박"도 쓰지 않는다. 날짜를 아는 것이 아니다.

**배지 하나만 쓴다.** 설명 문장(예: "행사가 끝나도 쿠폰함에 남아 있어요")은 넣지 않는다. 원칙 3(설명을 적지 않는다)을 따르고, 360px 머리 줄이 좁다. 설명이 필요하다는 판단이 나오면 별도 문구로 다시 승인받는다.

**승인 요청:** A, B, C 중 하나와, 배지만 쓰는 것에 대한 가부. 승인 전에는 구현 이슈를 시작하지 않는다.

## 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에서 닿는 묶음을 짚는다.

| 묶음 | 닿나 | 이 이슈에 넣나 |
|---|---|---|
| 1. 확실성 판정 | 닿는다. 최고 후보와 정렬 기여액이 바뀐다 | 넣는다. API `OfferComparison`, 웹 `filters.js`, 판정표(`receivedOnlyCases`)를 한 번에. 한쪽만 고치면 카드 순서와 "최고" 배지가 어긋난다 |
| 2. 배너 모양 | 닿지 않는다. 배너 칸이 바뀌지 않는다 | 해당 없음 |
| 3. 묶음 배너 | 닿지 않는다. 구성원 오퍼는 `receivedOnly`가 아니다 | 해당 없음 |
| 4. 최소주문 출처 | 닿는다. 받아 둔 쿠폰의 최소주문은 쿠폰함에서 읽은 값이다 | 값을 만드는 쪽은 tracker다. 화면은 있는 값을 그대로 쓴다. 지어내지 않는다 |
| 5. 알림 | 닿는다. 신규 알림 대상은 `isBestCandidate`를 부른다 | 넣는다. `receivedOnly`는 대상에서 빠진다. 새 알림 문구는 없다 |
| 6. 화면 글자 | 닿는다. 새 문구가 생긴다 | 이 문서의 승인 절차로 받는다. `COPY-STYLE.md`의 칸 표에 새 칸을 더하지는 않는다(배지 글자는 웹이 만든다). tracker 쪽 문구 검사 목록은 영향 없음 |
| 7. 행동 이벤트 | 속성만 더한다 | 넣는다. 이벤트 이름이 늘지 않아 대조 스크립트(`verify-analytics-event-contract.mjs`)는 영향 없음. 구현자가 실제로 돌려 확인한다 |
| 8. 저장소 경계, 배포 순서 | 닿는다 | 아래 |
| 9. 새 파일 | 해당 없음. 새 파일이 없다(설계 문서 추가는 `PROJECT-STRUCTURE.md` 재생성 대상일 수 있어 푸시 훅이 알려 준다) | |

묶음 1에서 하나를 따로 짚는다. 이 변경은 규칙이 "한 곳에 있다"는 이점을 쓰려고 `comparable` 한 함수에 조건을 더한다. 판정표 30행은 그대로 두고 새 배열로 보강한다(위). 이 방법으로 묶음 1이 늘거나 줄지 않는다.

### 배포 순서

1. **API 먼저.** `receivedOnly`를 아는 서버가 나가야 한다. tracker가 아직 칸을 안 내보내므로 모든 오퍼가 `false`로 간다. 화면에는 변화가 없다.
2. **웹 두 번째.** 웹은 `receivedOnly`가 없는 응답(옛 API)에서 `undefined`를 거짓으로 읽는다. 변화 없음.
3. **tracker 내보내기 마지막.** 이 순서를 어기면(내보내기가 먼저) 옛 웹이 받아 둔 쿠폰을 정상 오퍼로 그리고 최고 후보로 세운다. 이 설계의 B안이 안전했던 구간이 이 구간이다. API는 `FAIL_ON_UNKNOWN_PROPERTIES`가 꺼져 있어 모르는 키 때문에 깨지지는 않는다(ADR-012 주변, #155). 하지만 서버가 칸을 알아도 웹이 안 읽으면 보이는 오류다.
   - **tracker 이슈는 웹 배포가 운영에 확인된 뒤 켠다**고 이슈 본문에 적는다.

## 하지 않는 것

- 받아 둔 쿠폰의 별도 슬롯(같은 앱에 두 칩). 열린 질문 1.
- 쿠폰 만료일 표시 변경. `expiresAt`은 이미 있다. 이 이슈는 낮춤 표시만 다룬다.
- `status`(CONFIRMED, HELD) 재정의.
- 쿠폰함 잔존을 어떻게 판정하는지(허브 정상 읽기 2회 연속). tracker의 규칙이고 이 저장소가 다시 판정하지 않는다(ADR-003: 판단은 수집 쪽, 화면은 받은 값을 그린다).
- 숨김 처리 변경. 사용자가 "숨기기"로 브랜드를 가리는 기능은 그대로다.

## 열린 질문

답 없이도 기본안으로 시작할 수 있다.

1. **같은 앱에 살아 있는 오퍼가 있을 때 받아 둔 쿠폰을 아예 안 보이는 것이 맞나?** 기본안은 안 보인다(같은 슬롯에서 살아 있는 쪽이 이긴다). 쿠폰함에 5,000원이 실제로 있는데 허브 3,000원만 보이면 사용자가 손해일 수 있다. 다른 선택은 `#received` 슬롯을 따로 두는 것인데, API 슬롯, 웹 `offerKey`, tracker `offer_key` 세 곳이 함께 바뀐다(묶음 1과 비슷한 새 묶음). 이 비용을 낼 만한지는 사용자 판단이다.
2. **문구는 A, B, C 중 어느 것인가?** 위 승인 요청.
3. **tracker의 칸 이름과 뜻이 `receivedOnly`(불리언)로 가능한가?** 근거를 둘로 가른 출처 PR이 문자열 근거 값(예: 허브 관측, 쿠폰함만)을 이미 갖고 있을 수 있다. 그렇다면 불리언으로 줄이는 것이 맞는지(근거 값을 응답까지 올릴 이유가 없다는 것이 이 문서의 판단) tracker 쪽 확인이 필요하다.

## 후속

- tracker: 낮춘 쿠폰을 `receivedOnly: true`로 내보내기에 싣는다. 끝 조건은 운영 `export.json`에 칸이 실리고 API 응답에서 `receivedOnly: true`인 오퍼가 확인되는 것. `store.MERGEABLE_DETAIL`과 `offer_key`에 영향이 없는지 함께 본다. 비공개 저장소에서 따로 이슈를 만든다.
- API 구현 이슈, 웹 구현 이슈를 설계 승인 뒤에 만든다. API가 먼저다.
