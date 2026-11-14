# 설계: 할인금액이 같은 브랜드와 오퍼를 최소주문, 채널, 멤버십, 플랫폼 순으로 가른다

이슈: [#351](https://github.com/woowacourse-teams/2026-to-discount/issues/351)
상태: 2026-11-10 설계 초안. 승인 전.

## 0. 결론

- 동점을 가르는 비교 함수 둘을 `web/src/filters.js` 한 곳에 둔다. `compareOfferTie`(2~5번 키: 최소주문, 채널, 멤버십, 플랫폼)와 그 앞에 금액을 붙인 `compareOffers`(1~5번)다. `compareOffers`는 `compareOfferTie`를 불러 쓰므로 규칙은 한 벌이다.
- 카드 안(`couponModel.js` `splitOffers`)은 대표와 나머지 정렬을 이 함수로 바꾼다. 지금의 `byMinOrder`는 지운다.
- 브랜드 목록(`sortBrands`)은 고른 정렬 키를 다 본 뒤 이름순 앞에 "대표 오퍼끼리 `compareOfferTie`"를 한 단계 끼운다.
- `channelOf`는 `couponModel.js`에서 `filters.js`로 옮기고 `couponModel.js`는 같은 이름으로 다시 내보낸다. `couponModel.js`가 이미 `filters.js`를 import하고 있어, 반대 방향 import를 더하면 순환이 생기기 때문이다. 부르는 쪽(`offerSharing.js`, 테스트)은 고치지 않는다.
- 유지: 기본 정렬의 "최고 오퍼가 신규인 브랜드 맨 위"(`applyFilters`), 카드 동점의 "신규 첫 장"(`splitOffers`).
- **API는 바꾸지 않는다.** 웹은 지금도 API가 준 순서 위에 브랜드와 오퍼를 다시 세운다. 판정 함수(`comparable`, `sortingAmount`, `isBestCandidate`)도 안 건드려 확실성 판정표 묶음이 움직이지 않는다(5절).

## 1. 비교 순서

견줄 오퍼 둘 `a`, `b`에 아래를 차례로 본다. 앞 키가 같을 때만 다음 키로 간다.

| 순서 | 키 | 앞에 서는 것 | 값 읽기 |
| --- | --- | --- | --- |
| 1 | 할인금액 | 큰 것. `amount`가 `null`이면 맨 뒤(`-1`로 친다, 지금과 같다) | `offer.amount` |
| 2 | 최소주문금액 | 낮은 것. `null`, `undefined`는 맨 뒤(`Infinity`, 지금 `byMinOrder`와 같다) | `offer.minOrderAmount` |
| 3 | 채널 | 순위 0: 채널 없음(`null`) 또는 `배달/포장` → 1: `배달` → 2: `포장` → 3: 그 밖의 값 | `channelOf(offer)` |
| 4 | 멤버십 | 조건 없음(0) → 있음(1) | `offer.membership`이 `'none'`이거나 비어 있으면 없음 |
| 5 | 플랫폼 | 순위 0 `baemin`, 1 `coupangeats`, 2 `yogiyo`, 3 `ddangyo`, 4 그 밖(`own` 포함) | `offer.platform` |

상수와 함수 꼴(`filters.js`):

```js
// #351. 동점 가르기. 앞 키가 같을 때만 다음 키(최소주문 → 채널 → 멤버십 → 플랫폼).
// 플랫폼 순서는 PLATFORMS(필터 칩 순서: 땡겨요가 요기요 앞)와 다르다. 따로 둔다.
const TIE_PLATFORM_ORDER = ['baemin', 'coupangeats', 'yogiyo', 'ddangyo']
const TIE_CHANNEL_RANK = { 배달: 1, 포장: 2 }   // null, '배달/포장'은 0, 그 밖은 3
const rankOf = (order, v) => { const i = order.indexOf(v); return i < 0 ? order.length : i }
const channelRank = (o) => { const c = channelOf(o); return c == null || c === '배달/포장' ? 0 : (TIE_CHANNEL_RANK[c] ?? 3) }
const hasMembership = (o) => (o.membership && o.membership !== 'none' ? 1 : 0)
// 둘 다 모르면 0. (null ?? Infinity) 끼리 빼면 NaN이 나온다.
const byMin = (a, b) => (a == null && b == null ? 0 : (a ?? Infinity) - (b ?? Infinity))

export function compareOfferTie(a, b) {
  return byMin(a.minOrderAmount, b.minOrderAmount)
    || channelRank(a) - channelRank(b)
    || hasMembership(a) - hasMembership(b)
    || rankOf(TIE_PLATFORM_ORDER, a.platform) - rankOf(TIE_PLATFORM_ORDER, b.platform)
}
export function compareOffers(a, b) {
  return (b.amount ?? -1) - (a.amount ?? -1) || compareOfferTie(a, b)
}
```

- `byMin`: 지금 `byMinOrder`는 둘 다 `null`이면 `Infinity - Infinity = NaN`을 낸다. 지금은 마지막 키라 정렬이 그 쌍을 같은 값으로 다룰 뿐이지만, 뒤에 키가 붙으면 `NaN || 다음 키`의 뜻이 흐려진다. 둘 다 모를 때 0을 돌려준다.
- 채널 `그 밖의 값`(3)은 이슈에 없는 칸이다. `channelOf`는 구간의 `channel` 글자를 그대로 돌려주므로 `매장식사` 같은 값이 올 수 있다(`DiscountTier.java` 주석). 모르는 한정 채널을 무관 앞에 세우지 않으려고 맨 뒤에 둔다. 2026-11-10 운영 응답의 동점 9개 브랜드에는 이 값이 없다(이슈 배경의 셈).
- 멤버십은 이슈 문장대로 `offer.membership` 한 칸만 본다. 옛 행의 `badge` 끝말(`…전용쿠폰`)이나 구간 멤버십(`membershipOf`)은 쓰지 않는다. 6절 열린 질문 1.
- 다섯 키가 모두 같으면 0이다. `Array.prototype.sort`는 안정 정렬이라 API가 준 순서가 남고, 같은 입력에 같은 순서가 나온다.

## 2. 카드 안 (`couponModel.js` `splitOffers`)

```js
const sorted = [...offers].sort((a, b) => {
  const am = a.qualifier === '최대' ? 1 : 0
  const bm = b.qualifier === '최대' ? 1 : 0
  return am - bm || compareOffers(a, b)
})
const best = sorted.filter(isBest).sort((a, b) => isUpdated(b) - isUpdated(a) || compareOfferTie(a, b))
```

- 대표(`best`): 신규 먼저, 그다음 2~5번. 대표는 금액이 모두 같으므로 1번은 안 본다.
- 나머지(`rest`): "최대"(불확정) 뒤로, 금액 큰 순, 같으면 2~5번.
- 최고가 없는 카드(`hasBest` 거짓)의 대표 한 장도 위 `sorted` 맨 앞이므로 같은 규칙을 따른다.
- 묶음 행사(`bundles`) 순서는 그대로 둔다(API 순서).
- `byMinOrder` 상수는 지운다. 다른 쓰임은 없다(`git grep byMinOrder` 1건).

## 3. 브랜드 목록 (`filters.js` `sortBrands`)

### 대표 오퍼

```js
/** 브랜드 목록의 동점 가르기에 쓰는 대표 오퍼. 카드 대표(splitOffers의 best)와 같은 집합에서 compareOfferTie로 가장 앞선 것. 없으면 null. */
export function tieRepresentative(offers, include) {
  // 묶음 행사는 comparable이 거짓이라 따로 거르지 않아도 빠진다.
  const top = displayBestAmount(offers, include)
  if (top == null) return null
  const cands = offers.filter((o) => comparable(o, include) && !o.soldOut && o.amount === top)
  return cands.sort(compareOfferTie)[0] ?? null
}
```

- 집합은 `splitOffers`의 `isBest`와 같다(견줄 수 있고, 품절 아니고, 금액이 `displayBestAmount`와 같다). 카드에서 대표 줄에 서는 오퍼 가운데 하나라, 목록이 가른 근거가 카드에 보인다.
- 신규 여부는 대표를 고를 때 안 본다(이슈 요구사항: "위 순서에서 가장 앞선 것").
- 대표가 없는 브랜드(묶음 행사뿐, 특정메뉴뿐이고 넣기 꺼짐 등)는 `null`이다.

### 비교 사슬

```
확정 있음 먼저 → 고른 정렬 키(지금과 같다) → 대표 오퍼 compareOfferTie → 이름 가나다순
```

- 대표 비교: 둘 다 있으면 `compareOfferTie`. 한쪽만 있으면 있는 쪽이 앞. 둘 다 없으면 다음(이름)으로. 한쪽만 없을 때 이름으로 바로 넘기면 A(대표 있음), B(없음), C(있음) 사이에 순환이 생겨 정렬 결과가 입력 순서에 따라 흔들린다. 그래서 "없음은 뒤"로 고정한다.
- 고른 정렬이 인기순, 최신순, 최소주문금액이어도 그 키가 같으면 같은 대표 비교를 거친다(이슈: "선택한 정렬 키를 다 본 뒤에도 같으면"). 금액(1번)은 대표 비교에 넣지 않는다. 금액 정렬을 고르지 않은 사용자에게 금액이 숨은 기준이 되지 않게 하려는 것이다.
- 비교 함수 안에서 브랜드마다 대표를 다시 찾지 않는다. 정렬 전에 `Map<brand, representative>`로 한 번 계산한다(브랜드 117개, 비교 약 800회).
- `applyFilters`의 신규 끌어올리기는 `sortBrands` 결과를 둘로 나눌 뿐이라, 신규끼리와 나머지끼리 모두 새 사슬 순서를 따른다. 코드는 그대로다.

## 4. 바꾸는 파일

| 파일 | 바꿀 것 |
| --- | --- |
| `web/src/filters.js` | `channelOf` 옮겨 오기(본문 그대로), `compareOfferTie`, `compareOffers`, `tieRepresentative` 추가, `sortBrands` 사슬에 대표 비교 한 단계 |
| `web/src/couponModel.js` | `channelOf` 본문 지우고 `export { channelOf } from './filters.js'`(파일 안에서 쓰는 자리를 위해 import도), `splitOffers` 두 정렬을 새 함수로, `byMinOrder` 삭제 |
| `web/src/offerTieOrder.test.js` (새 파일) | 7절 시험. `run-node-tests.mjs`가 `src/**/*.test.js`를 전부 모아 돌리므로 `package.json` `test` 명령은 고치지 않는다 |
| `docs/PROJECT-STRUCTURE.md` | 새 시험 파일 때문에 `python scripts/generate_project_structure.py`로 다시 만든다(변경 전파 9번. 안 하면 push 훅이 막는다) |

새 노출 문구는 없다. 화면 마크업과 CSS도 안 바뀐다.

## 5. 변경 전파 확인

`docs/CHANGE-PROPAGATION.md`에 "정렬"이라는 이름의 묶음은 따로 없다. 정렬에 닿는 묶음은 둘이다.

- **1번 확실성 판정:** 묶음의 웹 쪽 자리(`isBestCandidate`, `comparisonAmount`, `sortingAmount`)와 판정표(`certainty-cases.json`)는 바꾸지 않는다. 새 함수는 판정 결과(`comparable`, `displayBestAmount`)를 읽기만 하고, 무엇이 최고 후보인지는 바꾸지 않는다. 그래서 `OfferComparison.java`를 함께 고칠 일이 없다.
- **8번 배포 순서:** API 응답 형태를 안 바꾸므로 API 먼저 배포할 것이 없다. 웹 단독 배포다.

API를 바꾸지 않아도 되는 이유(PR에 옮겨 적는다):

1. 비교에 쓰는 칸(`amount`, `minOrderAmount`, `tiers[].channel`, `badge`, `membership`, `platform`)은 지금 응답에 이미 있다.
2. 웹은 API 순서를 그대로 쓰지 않는다. 브랜드는 `sortBrands`가, 오퍼는 `splitOffers`가 다시 세운다. API `BrandComparison.byBestDiscount`는 확정 유무와 금액만 보고 동점을 가르지 않으며, 그 순서는 웹 정렬 앞에서 안정 정렬의 입력으로만 남는다.
3. 동점 가르기를 API에도 넣으면 같은 규칙이 Java와 JS 두 곳에 적혀 새 묶음이 생긴다. 웹 한 곳에 둔다.

## 6. 열린 질문

1. 멤버십 판정을 이슈 문장대로 `offer.membership` 한 칸으로 할지, 카드 칩이 쓰는 `membershipOf(offer)`(옛 행 `badge` 끝말 포함)로 할지. 설계는 이슈 문장을 따른다. 둘이 갈리는 것은 `membership` 칸이 없는 옛 행뿐이다. 승인 때 `membershipOf`로 바꾸라 하면 4번 키 한 줄만 바뀐다.
2. 채널 "그 밖의 값"을 맨 뒤(3)에 두는 것. 이슈에 없는 칸이라 승인 때 확인을 받는다.

## 7. 시험 (`web/src/offerTieOrder.test.js`)

픽스처는 합성이다. 오퍼는 `{ platform, amount, certainty: 'exact', kind: 'discount', ...extra }` 꼴(`couponModel.test.js`의 `o`와 같다).

| 이름 | 입력 | 기대 |
| --- | --- | --- |
| 채널만 다름 | 금액, 최소주문 같은 오퍼 셋. `badge: '포장 전용'`, `badge: '배달 전용'`, 채널 없음. 입력은 포장, 배달, 없음 순 | `splitOffers().best` 순서가 없음, 배달, 포장 |
| `배달/포장`은 무관과 같은 자리 | `tiers: [{ amount, channel: '배달/포장' }]` 오퍼와 `배달` 오퍼 | `배달/포장`이 앞 |
| 멤버십만 다름 | 금액, 채널 같고 `membership: 'baeminClub'`과 `membership: 'none'` | `none`이 앞. `membership` 칸 없는 오퍼도 `none`과 같은 자리 |
| 플랫폼만 다름 | 앞 키 모두 같은 `ddangyo`, `yogiyo`, `coupangeats`, `baemin`(이 순서로 입력) | baemin, coupangeats, yogiyo, ddangyo |
| 최소주문 `null` 맨 뒤 | 같은 금액, `minOrderAmount` 30000, `null`, 10000 | 10000, 30000, `null` |
| 앞 키가 뒤 키를 이긴다 | 최소주문 10000·포장 대 최소주문 20000·무관 | 10000·포장이 앞(이슈 "하지 않는 것"의 반례 고정) |
| 나머지 줄도 같은 규칙 | 최고 10000 하나 + 5000 둘(채널 포장, 무관) + 9000 `qualifier: '최대'` | `rest`가 5000 무관, 5000 포장, 9000 최대 |
| 신규 첫 장 유지 | 동점 대표 둘: 신규인 `ddangyo`·최소주문 20000, 신규 아닌 `baemin`·최소주문 10000 | `ddangyo`가 첫 장 |
| 브랜드 목록: 대표로 가름 | 금액 3000인 브랜드 `가`(대표 포장), `나`(대표 무관), 기본 정렬 아닌 `[{ key: 'amount', dir: 'desc' }]`로 `sortBrands` | `나`, `가` (이름순이면 `가`가 앞이라 양성 신호) |
| 브랜드 목록: 그래도 같으면 이름순 | 대표 키가 모두 같은 `나`, `가` | `가`, `나` |
| 브랜드 목록: 대표 없는 쪽이 뒤 | 인기순(`[{ key: 'popularity', dir: 'desc' }]`), 인기 같은 브랜드 둘. `가`는 특정메뉴 쿠폰뿐(넣기 꺼짐, 대표 없음), `나`는 확정 3000 | `나`, `가` |
| 기본 정렬 신규 맨 위 유지 | `applyFilters(defaultFilters())`. 금액 3000 신규 브랜드 `하`와 금액 5000 브랜드 | `하`가 맨 위 |
| 같은 입력 같은 순서 | 위 브랜드 목록 입력을 뒤섞은 세 순열 | `sortBrands` 결과가 셋 다 같다 |
| 비교 함수가 NaN을 안 낸다 | 최소주문 둘 다 `null`인 오퍼 | `compareOfferTie` 결과가 유한수 |

기존 시험은 그대로 초록이어야 한다. `couponModel.test.js`의 "동점 최고는 전부 best, 최소주문 낮은 순, 모르는 값은 뒤로"(`ddangyo`, `yogiyo`, `baemin`)는 최소주문만으로 갈리므로 결과가 같다.

확인 명령은 `docs/WORKFLOW.md` §5의 웹 확인 명령을 따른다.

## 8. 화면 확인

- 웹 프리뷰를 360px로 연다(`docs/WORKFLOW.md` §3-3).
- 3,000원 그룹: 기본 정렬에서 3,000원 브랜드들이 이름 가나다순이 아니라 대표 오퍼 키 순서로 서는지 본다.
- 동점 카드: 두 앱의 금액이 같은 브랜드 하나를 펼쳐 대표 캐러셀 순서가 1절 표와 맞는지 본다.
- 두 스크린샷을 PR에 싣는다.

## 9. 하지 않는 것

이슈의 "하지 않는 것"을 그대로 따른다: API 변경, 오퍼 단위 인기순, 추가된 순서, 채널을 최소주문 앞에 두는 안.
