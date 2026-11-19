<!-- 원본: tracker docs/superpowers/plans/2026-10-03-home-a-coupon-card.md — 여기서 고치지 않는다 -->
# 메인 화면 A안 1단계: 쿠폰 브랜드 카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 16차 확정 시안의 브랜드 카드(쿠폰 티켓형 최고 오퍼, 한 줄 이름, 접으면 로고 밑 금액, 펼치면 앱별 쿠폰)를 운영 카드와 나란히 만들고, 주소 끝 `?home=a`로만 켜지게 한다.

**Architecture:**
- 카드의 계산은 순수 함수 모듈 `couponModel.js`로 뺀다. 최고, 동점, 서브 오퍼, 배지, 계산식, 이름 글자 크기를 계산한다.
- 화면은 새 컴포넌트 `CouponCard.jsx`와 새 스타일 `styles/coupon-card.css`가 맡는다.
- 링크 사다리와 클릭 계측은 운영 카드(`OfferChip.jsx`)에서 함수로 꺼내 두 카드가 같이 쓴다.
- `App.jsx`는 마운트 뒤 `?home=a`를 읽어 카드 컴포넌트를 고른다. 서버 렌더링 첫 화면은 늘 운영 카드라 하이드레이션이 어긋나지 않는다.

**Tech Stack:** React 18, Vite 5, 일반 CSS(라이브러리 없음, MUI 검토 결과 쓰지 않음), node:test(`npm test`).

**Spec:** tracker `docs/superpowers/specs/2026-10-02-home-a-design.md` 4절 9차~16차. 시안 https://claude.ai/artifact/Lec9gdjZAZoUJW4y73C9Ag (8판, 16차).

## 명세가 이긴다 (2026-10-03 사용자 확정)

표시 모델 명세 [`2026-10-03-home-a-display-model.md`](../specs/2026-10-03-home-a-display-model.md)가 이 계획의 코드 예시보다 우선한다. 아래 작업의 코드와 다른 점은 명세대로 구현한다.

1. **`badgesOf(offer, { showBestFit = true } = {})`**: 명세 4절 순서와 조건 그대로 낸다. 값의 성격(불확정, 랜덤, 특정메뉴, 최적, n%할인) → 멤버십(`MEMBERSHIP_LABEL[offer.platform]`, membership이 `none`이 아니거나 badge가 `전용쿠폰`으로 끝날 때) → 한정(badge 원문, 시각 꼴만 "N시"). 각 배지는 `{ kind, text }`이고 kind는 `qualifier-plain | qualifier-random | best-fit | rate | membership | limited`. 테스트는 명세 4절 표의 행마다 하나씩 쓴다.
2. **운영 칩도 `badgesOf`를 쓴다**(작업 2에 더한다): `OfferChip.jsx`의 `chip-tags` 안 조건문을 `badgesOf(offer, { showBestFit: false })` 결과를 그리는 코드로 바꾼다. "최고" 탭은 칩에 그대로 둔다. 운영 화면 결과가 바뀌면 안 된다. 바뀌기 전 칩 HTML 스냅숏 테스트를 먼저 쓴다.
3. **배지 자리**(작업 3):
   - 단독 최고는 이름 옆에 라벨로 둔다. 줄이 넘치면 다음 줄로 간다(flex-wrap).
   - 복수 최고는 쿠폰 오른쪽 위 포스트잇으로 둔다. 앱마다 배지가 다르면 배지마다 그 앱 아이콘(12px)을 앞에 붙인다. 쿠폰 앱 줄 안에는 배지를 넣지 않는다.
   - 펼친 쿠폰은 금액 오른쪽, 이동 꼭지 왼쪽에 라벨로 둔다.
   - 접힌 하위 라벨에는 배지가 없다.
4. **최적 계산식**: 단독 최고면 이름 줄 아래, 펼친 쿠폰이면 그 쿠폰 배지 아래 한 줄. 복수 최고 포스트잇 아래에는 두지 않는다.
5. **품절**: 쿠폰 금액에 취소선, 옆에 "품절" 라벨(운영과 같다).
6. **하위 정렬**: `qualifier === '최대'`는 뒤로 민 뒤 금액 큰 순(운영과 같다).

## 이 계획에 넣지 않는 것 (다음 계획)

| 단계 | 내용 | 이유 |
|---|---|---|
| 2 | New 배지: 오퍼를 처음 본 시각(`firstSeenAt`) 내보내기 → API → 웹, 방문자별 판정 | 수집기, API, 웹 세 저장소에 걸친다. 데이터 계획을 따로 쓴다 |
| 3 | 상단을 검색과 거르기 시트로, 정렬 글자, "전체 / New N" | 카드와 독립이다 |
| 4 | 배너를 목록 안 행사 줄로 | 배너 실험(순서 교대)과 묶어 정한다 |
| 5 | 방문자 반반 배정(`home: 'now' \| 'a'`)과 지표 | 1~4가 끝나야 비교할 화면이 생긴다 |

## Global Constraints

- 프론트는 프리뷰 먼저: 브랜치 → 미러 `preview/<이름>` → Vercel 프리뷰 → 360px 확인 → 사용자 승인 → main(`AGENTS.md`).
- 서버 렌더링(SSR) 첫 렌더에서 `window`, `localStorage`, 기기 날짜를 쓰지 않는다(web ADR-003). 브라우저 값은 effect에서 읽는다.
- 카드당 화면 요소를 운영 카드(약 61개)보다 늘리지 않는다. 쿠폰 절취 홈은 CSS 마스크로 판다(이미지, 추가 요소 없음).
- 그린 뒤 폭을 재는 코드(`getBoundingClientRect`, `offsetWidth`, `ResizeObserver`)를 카드에 넣지 않는다. 총 차단 시간(2026-10-02 실측 약 1.5초)을 지킨다.
- 동점 최고는 하나를 골라 올리지 않는다(운영 카드 규칙, 거짓 우열 금지).
- 화면 문구는 `mono/docs/COPY-STYLE.md`를 따른다. 새 문구는 셋뿐이다: "눌러서 자세히 보기", "접기", 최소주문 표기(`↑18,900` 꼴, 0이면 "최소주문 없음", 모르면 "최소주문 ?").
- 이모지를 쓰지 않는다. 아이콘은 인라인 SVG다.
- 파일은 LF, UTF-8. `git add`는 파일 이름으로만 담는다. 커밋 메시지는 한국어로 쓰고 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.

## Review Focus

1. **품절이거나 견줄 수 없는 오퍼만 있는 브랜드:** 최고가 없을 때 운영 카드처럼 맨 앞 오퍼를 대표로 쓰고, 쿠폰 금액은 회색으로 둔다. Task 1에 테스트가 있다.
2. **링크가 없는 앱:** 사다리 끝까지 내려가도 링크가 있어야 한다. 운영 카드와 같은 함수를 쓰므로 Task 2 테스트가 지킨다.
3. **금액이 없는 오퍼(`amount: null`, 원문만 있음):** 쿠폰 금액 자리에 원문(`rawText`)을 그대로 쓴다. 숫자로 바꾸려다 `NaN원`을 찍으면 안 된다. Task 1에 테스트가 있다.
4. **딥링크(`#brand-이름`)로 들어온 카드:** 펼친 채로 그 카드로 스크롤해야 한다. Task 3이 운영 카드와 같은 효과를 둔다.
5. **이름이 아주 긴 브랜드("토핑몬스터피자TMPPIZZA"):** 한 줄을 넘지 않고 12px 아래로 작아지지 않는다. Task 1의 `nameFontPx` 테스트가 지킨다.

---

## 파일 구조

| 파일 | 할 일 |
|---|---|
| `web/src/couponModel.js` (새로) | 카드 계산 순수 함수 |
| `web/src/couponModel.test.js` (새로) | 위 함수 테스트 |
| `web/src/offerLink.js` (새로) | 링크 사다리 `offerLink`, 클릭 계측 속성 `offerClickProps` |
| `web/src/offerLink.test.js` (새로) | 사다리 테스트 |
| `web/src/OfferChip.jsx` (고침) | 링크와 계측을 `offerLink.js`에서 가져다 쓴다. 동작은 그대로 |
| `web/src/CouponCard.jsx` (새로) | 새 카드 |
| `web/src/styles/coupon-card.css` (새로) | 새 카드 스타일 |
| `web/src/App.jsx` (고침) | `?home=a`면 마운트 뒤 `CouponCard`를 쓴다 |

---

### Task 1: 카드 계산 모듈

**Files:**
- Create: `web/src/couponModel.js`
- Test: `web/src/couponModel.test.js`

**Interfaces:**
- Consumes: `filters.js`의 `comparable(offer, include)`, `displayBestAmount(offers, include)`
- Produces:
  - `splitOffers(offers, include) → { best: Offer[], rest: Offer[], hasBest: boolean }`
  - `minLabel(minOrderAmount) → string`
  - `formulaOf(offer) → string | null`
  - `badgesOf(offer) → Array<{ kind: 'time'|'wow'|'club'|'best', text: string }>`
  - `sharedBadges(offers) → Array<...> | null`
  - `nameFontPx(name) → number`
  - `amountText(offer) → string`

- [ ] **Step 1: 실패하는 테스트 쓰기**

```js
// web/src/couponModel.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOffers, minLabel, formulaOf, badgesOf, sharedBadges, nameFontPx, amountText } from './couponModel.js'

const o = (platform, amount, extra = {}) => ({ platform, amount, certainty: 'exact', kind: 'discount', ...extra })

test('최고가 하나면 best 하나, 나머지는 금액 큰 순', () => {
  const r = splitOffers([o('baemin', 7500), o('coupangeats', 10000), o('ddangyo', 5000)], null)
  assert.deepEqual(r.best.map((x) => x.platform), ['coupangeats'])
  assert.deepEqual(r.rest.map((x) => x.amount), [7500, 5000])
  assert.equal(r.hasBest, true)
})

test('동점 최고는 전부 best, 최소주문 낮은 순, 모르는 값은 뒤로', () => {
  const r = splitOffers([
    o('yogiyo', 5000, { minOrderAmount: 30000 }),
    o('ddangyo', 5000, { minOrderAmount: 21000 }),
    o('baemin', 5000),
  ], null)
  assert.deepEqual(r.best.map((x) => x.platform), ['ddangyo', 'yogiyo', 'baemin'])
  assert.equal(r.rest.length, 0)
})

test('견줄 수 없는 오퍼만 있으면 맨 앞 하나를 대표로, hasBest는 false', () => {
  const r = splitOffers([o('baemin', 5000, { soldOut: true }), o('yogiyo', 3000, { soldOut: true })], null)
  assert.equal(r.best.length, 1)
  assert.equal(r.best[0].amount, 5000)
  assert.equal(r.hasBest, false)
})

test('최소주문 표기', () => {
  assert.equal(minLabel(18900), '18,900')
  assert.equal(minLabel(0), '최소주문 없음')
  assert.equal(minLabel(null), '최소주문 ?')
  assert.equal(minLabel(undefined), '최소주문 ?')
})

test('계산식은 요기요 최적이고 식 기호가 있을 때만', () => {
  assert.equal(formulaOf(o('yogiyo', 5250, { qualifier: '최적', conditions: '25,000원 × 5% + 4,000원' })), '25,000원 × 5% + 4,000원')
  assert.equal(formulaOf(o('yogiyo', 5250, { qualifier: '최적', conditions: '첫 주문만' })), null)
  assert.equal(formulaOf(o('baemin', 5000, { conditions: '25,000원 × 5%' })), null)
})

test('배지: 선착순 시각, 멤버십, 최적', () => {
  const b = badgesOf(o('coupangeats', 10000, { firstCome: true, badge: '오전 11시 오픈', membership: 'coupangEats' }))
  assert.deepEqual(b, [{ kind: 'time', text: '11시' }, { kind: 'wow', text: '쿠팡와우' }])
  assert.deepEqual(badgesOf(o('baemin', 7500, { membership: 'baeminClub' })), [{ kind: 'club', text: '배민클럽' }])
  assert.deepEqual(badgesOf(o('yogiyo', 5000, { qualifier: '최적' })), [{ kind: 'best', text: '최적' }])
})

test('동점 배지가 모두 같으면 sharedBadges가 그 배지, 다르면 null', () => {
  const t = { firstCome: true, badge: '오전 11시 오픈' }
  assert.deepEqual(sharedBadges([o('baemin', 7000, t), o('ddangyo', 7000, t)]), [{ kind: 'time', text: '11시' }])
  assert.equal(sharedBadges([o('yogiyo', 5000, { qualifier: '최적' }), o('ddangyo', 5000)]), null)
  assert.equal(sharedBadges([o('yogiyo', 5000), o('ddangyo', 5000)]), null)
})

test('이름 글자 크기: 8자까지 17, 한 자마다 0.7씩, 12 아래로 안 간다', () => {
  assert.equal(nameFontPx('bhc'), 17)
  assert.equal(nameFontPx('꾸브라꼬숯불치킨'), 17)
  assert.equal(nameFontPx('호식이두마리치킨앤'), 16.3)
  assert.equal(nameFontPx('토핑몬스터피자TMPPIZZA'), 12)
})

test('금액 글자: 숫자가 없으면 원문', () => {
  assert.equal(amountText(o('baemin', 11000)), '11,000원')
  assert.equal(amountText({ platform: 'own', amount: null, rawText: '1+1' }), '1+1')
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd web && node --test src/couponModel.test.js`
Expected: FAIL, `Cannot find module './couponModel.js'`

- [ ] **Step 3: 구현**

```js
// web/src/couponModel.js
// 쿠폰 브랜드 카드(메인 화면 A안 16차)의 계산. 화면 없이 테스트한다.
import { comparable, displayBestAmount } from './filters.js'

const byMinOrder = (a, b) => (a.minOrderAmount ?? Infinity) - (b.minOrderAmount ?? Infinity)

/**
 * 최고(동점이면 전부)와 나머지. 최고는 운영 카드(BrandCard)와 같은 규칙으로 고른다:
 * 견줄 수 있고 품절이 아닌 오퍼 중 가장 큰 금액. 동점은 하나를 골라 올리지 않는다.
 * 최고가 없으면(전부 품절이거나 견줄 수 없음) 금액 큰 맨 앞 하나를 대표로 쓴다.
 */
export function splitOffers(offers, include) {
  const top = displayBestAmount(offers, include)
  const isBest = (x) => top != null && comparable(x, include) && !x.soldOut && x.amount === top
  const sorted = [...offers].sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1))
  const best = sorted.filter(isBest).sort(byMinOrder)
  if (best.length > 0) return { best, rest: sorted.filter((x) => !isBest(x)), hasBest: true }
  return { best: sorted.slice(0, 1), rest: sorted.slice(1), hasBest: false }
}

export function minLabel(m) {
  if (m === 0) return '최소주문 없음'
  if (m == null) return '최소주문 ?'
  return m.toLocaleString('ko-KR')
}

/** 요기요 "최적"(쿠폰을 겹친 값)의 계산식. 식 기호가 있는 문장만 식으로 본다. */
export function formulaOf(offer) {
  if (offer.qualifier !== '최적' || !offer.conditions) return null
  return /[×+=]/.test(offer.conditions) ? offer.conditions : null
}

export function badgesOf(offer) {
  const out = []
  if (offer.firstCome && /\d+시/.test(offer.badge ?? '')) out.push({ kind: 'time', text: offer.badge.match(/\d+시/)[0] })
  if (offer.membership === 'coupangEats') out.push({ kind: 'wow', text: '쿠팡와우' })
  if (offer.membership === 'baeminClub') out.push({ kind: 'club', text: '배민클럽' })
  if (offer.qualifier === '최적') out.push({ kind: 'best', text: '최적' })
  return out
}

/** 동점 최고의 배지가 모두 같으면 그 배지(쿠폰 모서리 포스트잇). 다르거나 없으면 null. */
export function sharedBadges(offers) {
  const keys = offers.map((x) => JSON.stringify(badgesOf(x)))
  if (keys.some((k) => k !== keys[0])) return null
  const first = badgesOf(offers[0])
  return first.length ? first : null
}

/** 이름 한 줄. 그린 뒤 폭을 재지 않고 글자 수로 정한다(배치 계산을 늘리지 않으려고). */
export function nameFontPx(name) {
  const len = [...name].length
  const px = 17 - Math.max(0, len - 8) * 0.7
  return Math.max(12, Math.round(px * 10) / 10)
}

export function amountText(offer) {
  return offer.amount != null ? `${offer.amount.toLocaleString('ko-KR')}원` : (offer.rawText ?? '')
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd web && node --test src/couponModel.test.js`
Expected: PASS(9개)

- [ ] **Step 5: 커밋**

```bash
git add web/src/couponModel.js web/src/couponModel.test.js
git commit -m "feat(web): 쿠폰 카드 계산 모듈 — 최고와 동점, 최소주문 표기, 최적 계산식, 배지, 이름 크기"
```

---

### Task 2: 링크 사다리와 클릭 계측을 함수로 꺼낸다

**Files:**
- Create: `web/src/offerLink.js`
- Test: `web/src/offerLink.test.js`
- Modify: `web/src/OfferChip.jsx` (상수 `PLATFORM_APP_LINKS`, `PLATFORM_BRAND_SEARCH_LINKS`, `hubLinks`, `setHubLinks`를 옮기고, `const link = ...`와 `track('offer_link_click', {...})`의 속성 객체를 함수 호출로 바꾼다)

**Interfaces:**
- Produces:
  - `offerLink(offer, brandLinks, brandName) → string`
  - `offerClickProps({ offer, brandName, position, best }) → object`(지금 `offer_link_click` 속성과 같은 키)
  - `setHubLinks(banners)`(옮긴 것. `main.jsx`, `entry-server.jsx`의 import를 `./offerLink.js`로 바꾼다)

- [ ] **Step 1: 실패하는 테스트 쓰기**

```js
// web/src/offerLink.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { offerLink, offerClickProps } from './offerLink.js'

test('오퍼 자신의 링크가 먼저, 그다음 브랜드 링크', () => {
  assert.equal(offerLink({ platform: 'baemin', link: 'https://a' }, { baemin: 'https://b' }, 'BBQ'), 'https://a')
  assert.equal(offerLink({ platform: 'baemin' }, { baemin: 'https://b' }, 'BBQ'), 'https://b')
})

test('링크가 없어도 사다리 끝까지 내려가 빈 값이 없다', () => {
  for (const p of ['baemin', 'coupangeats', 'yogiyo', 'ddangyo']) {
    assert.ok(offerLink({ platform: p }, {}, 'BBQ'), `${p} 링크가 비었다`)
  }
})

test('클릭 속성은 운영 카드와 같은 키', () => {
  const p = offerClickProps({ offer: { platform: 'baemin', amount: 7000, minOrderAmount: 18000 }, brandName: 'BBQ', position: 3, best: true })
  assert.deepEqual(Object.keys(p).sort(), ['amount', 'best', 'brand', 'fromBanner', 'held', 'membership', 'minOrder',
    'platform', 'position', 'qualifier', 'soldOut', 'tierMode', 'tiers'].sort())
  assert.equal(p.brand, 'BBQ'); assert.equal(p.best, true); assert.equal(p.minOrder, 18000)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd web && node --test src/offerLink.test.js`
Expected: FAIL, 모듈 없음

- [ ] **Step 3: 구현**

`OfferChip.jsx` 맨 위의 `PLATFORM_APP_LINKS`, `PLATFORM_BRAND_SEARCH_LINKS`, `HUB_LINK_MARKERS`, `hubLinks`, `setHubLinks`를 주석째 `web/src/offerLink.js`로 그대로 옮긴다. 그 아래에 다음을 더한다.

```js
// web/src/offerLink.js (옮긴 상수와 setHubLinks 아래)
/** 오퍼 링크 사다리. 오퍼 자신의 링크 → 브랜드 링크 → 앱 안 브랜드 검색 → 허브 → 앱 열기. */
export function offerLink(offer, brandLinks, brandName) {
  return offer.link
    ?? brandLinks?.[offer.platform]
    ?? PLATFORM_BRAND_SEARCH_LINKS[offer.platform]?.(brandName)
    ?? hubLinks[offer.platform]
    ?? PLATFORM_APP_LINKS[offer.platform]
}

/** offer_link_click 속성. 운영 카드와 쿠폰 카드가 같은 키로 남긴다(PostHog 대시보드가 이 키로 가른다). */
export function offerClickProps({ offer, brandName, position, best }) {
  return {
    brand: brandName,
    platform: offer.platform,
    position,
    amount: offer.amount ?? null,
    minOrder: offer.minOrderAmount ?? null,
    qualifier: offer.qualifier ?? 'none',
    membership: offer.membership ?? 'none',
    tierMode: offer.tierMode ?? 'none',
    tiers: Array.isArray(offer.tiers) ? offer.tiers.length : 0,
    best: !!best,
    held: offer.status === 'held',
    soldOut: !!offer.soldOut,
    fromBanner: !!offer.link,
  }
}
```

`OfferChip.jsx`에서 `const link = offer.link ?? ...` 다섯 줄을 `const link = offerLink(offer, brandLinks, brandName)`로, `track('offer_link_click', { ... })`를 `track('offer_link_click', offerClickProps({ offer, brandName, position, best }))`로 바꾸고 `import { offerLink, offerClickProps } from './offerLink.js'`를 더한다. `setHubLinks` import는 `main.jsx`, `entry-server.jsx`에서 `./offerLink.js`로 바꾼다.

- [ ] **Step 4: 전체 테스트와 빌드**

Run: `cd web && npm test && npm run build`
Expected: 실패 0, 빌드 끝에 `[ssr] template.js 생성`

- [ ] **Step 5: 커밋**

```bash
git add web/src/offerLink.js web/src/offerLink.test.js web/src/OfferChip.jsx web/src/main.jsx web/src/entry-server.jsx
git commit -m "refactor(web): 오퍼 링크 사다리와 클릭 계측 속성을 offerLink.js로 꺼낸다(동작 그대로)"
```

---

### Task 3: 쿠폰 카드 컴포넌트와 스타일

**Files:**
- Create: `web/src/CouponCard.jsx`
- Create: `web/src/styles/coupon-card.css`

**Interfaces:**
- Consumes: Task 1 전부, Task 2 `offerLink`, `offerClickProps`, `brandCardId`(`BrandCard.jsx`), `BrandLogo`, `PlatformBadge`(`logos.jsx`), `observeBrandImpression`, `brandImpressionProps`(`brandImpression.js`), `OfferDetail`(펼친 쿠폰 아래 상세 조건)
- Produces: `export default memo(CouponCard)`, props는 운영 `BrandCard`와 같다: `{ brand, position, highlighted, onInteract, include, onHide, leaving }`

- [ ] **Step 1: 컴포넌트 작성**

```jsx
// web/src/CouponCard.jsx
// 메인 화면 A안 16차 브랜드 카드. 시안: https://claude.ai/artifact/Lec9gdjZAZoUJW4y73C9Ag
// 쿠폰 구조는 늘 같다(앱 아이콘, 금액, 최소주문, 이동 꼭지). 계산식과 조건 글자는 쿠폰 밖에 둔다.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { track } from './analytics.js'
import { brandImpressionProps, observeBrandImpression } from './brandImpression.js'
import { brandCardId } from './BrandCard.jsx'
import { amountText, badgesOf, formulaOf, minLabel, nameFontPx, sharedBadges, splitOffers } from './couponModel.js'
import { BrandLogo, PlatformBadge } from './logos.jsx'
import { offerClickProps, offerLink } from './offerLink.js'
import { offerKey } from './filters.js'
import './styles/coupon-card.css'

const Go = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h9v9M16 4L5 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
const Up = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l4 5H7.2v3H4.8V7H2z" fill="currentColor" /></svg>
)

function Badges({ list }) {
  return list.map((b) => <span key={b.kind} className={`cc-tag cc-tag--${b.kind}`}>{b.text}</span>)
}

function Min({ value }) {
  return <span className="cc-min">{value > 0 && <Up />}{minLabel(value)}</span>
}

function OfferLinkA({ offer, brand, position, best, className, children }) {
  const href = offerLink(offer, brand.links, brand.name)
  const web = href.startsWith('http')
  return (
    <a className={className} href={href} target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       aria-label={`${brand.name} ${amountText(offer)}, 앱으로 이동`}
       onClick={() => track('offer_link_click', offerClickProps({ offer, brandName: brand.name, position, best }))}>
      {children}
    </a>
  )
}

function Ticket({ brand, best, hasBest, position }) {
  if (best.length === 1) {
    const o = best[0]
    return (
      <OfferLinkA offer={o} brand={brand} position={position} best={hasBest} className={`cc-ticket${hasBest ? '' : ' cc-ticket--muted'}`}>
        <span className="cc-info">
          <PlatformBadge platformKey={o.platform} brand={brand.name} />
          <span><span className="cc-amt">{amountText(o)}</span><Min value={o.minOrderAmount} /></span>
        </span>
        <span className="cc-stub"><Go /></span>
      </OfferLinkA>
    )
  }
  const shared = sharedBadges(best)
  return (
    <div className="cc-ticket-wrap">
      <div className="cc-ticket cc-ticket--tie">
        <span className="cc-info"><span className="cc-amt">{amountText(best[0])}</span></span>
        <span className="cc-apps">
          {best.map((o) => (
            <OfferLinkA key={offerKey(o)} offer={o} brand={brand} position={position} best className="cc-app">
              <PlatformBadge platformKey={o.platform} brand={brand.name} />
              <span className="cc-app-mid"><Min value={o.minOrderAmount} />{!shared && <span className="cc-app-tags"><Badges list={badgesOf(o)} /></span>}</span>
              <Go />
            </OfferLinkA>
          ))}
        </span>
      </div>
      {shared && <span className="cc-postit"><Badges list={shared} /></span>}
    </div>
  )
}

function CouponCard({ brand, position, highlighted, onInteract, include = null, onHide, leaving = false }) {
  const { best, rest, hasBest } = useMemo(() => splitOffers(brand.offers, include), [brand.offers, include?.random, include?.menu])
  const [open, setOpen] = useState(false)
  const cardRef = useRef(null)
  const headRef = useRef(null)
  const toggle = () => {
    onInteract?.()
    setOpen((v) => {
      if (!v) track('brand_expand', { brand: brand.name, category: brand.category ?? 'none' })
      return !v
    })
  }
  useEffect(() => {
    if (highlighted) { setOpen(true); cardRef.current?.scrollIntoView({ block: 'center' }) }
  }, [highlighted])
  useEffect(() => observeBrandImpression(headRef.current, brandImpressionProps(brand, position),
    (p) => track('brand_impression', p)), [brand, position])

  const fx = best.map(formulaOf).find(Boolean)
  const all = [...best, ...rest]
  return (
    <article id={brandCardId(brand.name)} ref={cardRef} data-brand={brand.name}
             className={`cc${open ? ' cc--open' : ''}${highlighted ? ' cc--highlighted' : ''}${leaving ? ' cc--leaving' : ''}`}>
      <div className="cc-side" ref={headRef}>
        <span className="cc-logo"><BrandLogo name={brand.name} /></span>
        {rest.map((o) => (
          <span key={offerKey(o)} className="cc-alt"><PlatformBadge platformKey={o.platform} brand={brand.name} />{amountText(o)}</span>
        ))}
      </div>
      <div className="cc-main">
        <div className="cc-name">
          <button type="button" aria-expanded={open} onClick={toggle}>
            <span className="cc-nm" style={{ fontSize: `${nameFontPx(brand.name)}px` }}>{brand.name}</span>
          </button>
          {best.length === 1 && <Badges list={badgesOf(best[0])} />}
        </div>
        {fx && <div className="cc-fx">{fx}</div>}
        <div className="cc-deal"><Ticket brand={brand} best={best} hasBest={hasBest} position={position} /></div>
        <button type="button" className="cc-hint" aria-expanded={open} onClick={toggle}>
          {open ? '접기' : '눌러서 자세히 보기'}
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {onHide && (
        <button type="button" className="cc-hide" aria-label={`${brand.name} 숨기기`} title="숨기기"
                onClick={() => onHide(brand.name, hasBest ? best[0].amount : null)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3l18 18M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.2 6.7C3.9 8.2 3 10.2 3 12c0 2.5 4 7 9 7 1.6 0 3-.4 4.2-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
        </button>
      )}
      {/* 펼친 쿠폰은 펼쳤을 때만 그린다(접힌 동안 요소 수를 늘리지 않는다). */}
      {open && (
        <div className="cc-more">
          {all.map((o) => (
            <OfferLinkA key={offerKey(o)} offer={o} brand={brand} position={position} best={hasBest && best.includes(o)} className="cc-plat">
              <span className="cc-pi">
                <PlatformBadge platformKey={o.platform} brand={brand.name} />
                <span><span className="cc-amt cc-amt--sm">{amountText(o)}</span><Min value={o.minOrderAmount} /></span>
                <span className="cc-side-tags"><Badges list={badgesOf(o)} />{formulaOf(o) && <span className="cc-fx">{formulaOf(o)}</span>}</span>
              </span>
              <span className="cc-ps"><Go /></span>
            </OfferLinkA>
          ))}
        </div>
      )}
    </article>
  )
}

export default memo(CouponCard)
```

- [ ] **Step 2: 스타일 작성**

`web/src/styles/coupon-card.css`에 시안 8판의 `/* 한 줄 카드 */`부터 `.fx`까지를 `cc-` 접두어로 옮긴다. 값은 시안과 같다. 핵심 규칙:

```css
/* web/src/styles/coupon-card.css — 메인 화면 A안 16차. 시안 8판과 같은 값이다. */
.cc{position:relative;background:var(--card-bg,#fff);border:1px solid #eaeaea;border-radius:12px;padding:12px;display:grid;grid-template-columns:64px 1fr;gap:4px 12px;content-visibility:auto;contain-intrinsic-size:auto 170px}
.cc-side{display:flex;flex-direction:column;align-items:center;gap:6px}
/* 투명 로고가 다크 모드에서도 보이게 바탕은 늘 흰색 */
.cc-logo{width:64px;height:64px;border-radius:12px;background:#fff;border:1px solid #eaeaea;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cc-alt{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:#787774;font-variant-numeric:tabular-nums;white-space:nowrap}
.cc-alt img{width:16px;height:16px;border-radius:4px}
.cc-main{min-width:0;display:flex;flex-direction:column;gap:6px}
.cc-name{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;padding-right:28px}
.cc-name button{all:unset;cursor:pointer;min-width:0;max-width:100%}
.cc-nm{display:block;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-tag{font-size:11px;font-weight:700;border-radius:5px;padding:1px 6px;white-space:nowrap}
.cc-tag--time{background:#fbf3db;color:#956400}
.cc-tag--wow{background:#111;color:#fff}
.cc-tag--club{background:#0cefd3;color:#06382f}
.cc-tag--best{background:#edf3ec;color:#346538}
.cc-fx{font-size:11.5px;color:#346538;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.cc-deal{display:flex}
.cc-ticket{--stub:58px;flex:1;min-width:0;min-height:76px;display:grid;grid-template-columns:1fr var(--stub);border-radius:10px;background:#f3f1ec;color:inherit;text-decoration:none;
  -webkit-mask:radial-gradient(circle 7px at calc(100% - var(--stub)) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 7px at calc(100% - var(--stub)) 100%,#0000 98%,#000) bottom/100% 51% no-repeat;
          mask:radial-gradient(circle 7px at calc(100% - var(--stub)) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 7px at calc(100% - var(--stub)) 100%,#0000 98%,#000) bottom/100% 51% no-repeat}
.cc-ticket:active{transform:scale(.985)}
.cc-ticket--muted .cc-amt{color:#787774}
.cc-ticket--tie{--stub:132px}
.cc-info{display:flex;align-items:center;gap:12px;padding:16px 14px;min-width:0}
.cc-info img{width:34px;height:34px;border-radius:9px}
.cc-amt{display:block;font-size:25px;font-weight:800;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.cc-ticket--tie .cc-amt{font-size:22px}
.cc-amt--sm{font-size:18px}
.cc-min{display:flex;align-items:center;gap:2px;font-size:11.5px;color:#787774;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.cc-min svg{width:11px;height:11px}
.cc-stub{display:flex;align-items:center;justify-content:center;background:#111;color:#fff;border-left:1.5px dashed #cfccc4}
.cc-stub svg,.cc-ps svg{width:18px;height:18px}
.cc-ticket-wrap{flex:1;min-width:0;position:relative;display:flex}
.cc-apps{display:flex;flex-direction:column;border-left:1.5px dashed #cfccc4}
.cc-app{flex:1;min-width:0;display:grid;grid-template-columns:20px 1fr 14px;align-items:center;gap:6px;padding:6px 10px;background:#111;color:#fff;text-decoration:none}
.cc-app+.cc-app{border-top:1px solid rgba(255,255,255,.18)}
.cc-app .cc-min{color:inherit;opacity:.85}
.cc-app img{width:20px;height:20px;border-radius:5px}
.cc-app svg{width:14px;height:14px}
.cc-app-mid{display:flex;flex-direction:column;gap:2px;min-width:0}
.cc-app-tags .cc-tag{font-size:9.5px;padding:0 4px}
/* 동점 배지가 모두 같으면 절취부 오른쪽 위 포스트잇(운영 배지처럼, 오른쪽으로 기울기) */
.cc-postit{position:absolute;top:-9px;right:8px;display:flex;gap:3px;transform:rotate(4deg);transform-origin:left bottom;pointer-events:none}
.cc-hint{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;margin-top:2px;font-size:12px;color:#787774}
.cc-hint svg{width:12px;height:12px;transition:transform .15s}
.cc--open .cc-hint svg{transform:rotate(180deg)}
.cc-hide{position:absolute;top:8px;right:8px;background:none;border:0;color:#b4b2ad;padding:4px;cursor:pointer}
.cc-more{grid-column:1/3;display:flex;flex-direction:column;gap:6px;margin-top:6px}
.cc-plat{display:grid;grid-template-columns:1fr 40px;min-height:52px;border-radius:9px;background:#f3f1ec;color:inherit;text-decoration:none;
  -webkit-mask:radial-gradient(circle 5px at calc(100% - 40px) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 5px at calc(100% - 40px) 100%,#0000 98%,#000) bottom/100% 51% no-repeat;
          mask:radial-gradient(circle 5px at calc(100% - 40px) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 5px at calc(100% - 40px) 100%,#0000 98%,#000) bottom/100% 51% no-repeat}
.cc-pi{display:flex;align-items:center;gap:10px;padding:8px 12px;min-width:0}
.cc-pi img{width:26px;height:26px;border-radius:7px}
.cc-side-tags{display:flex;flex-direction:column;align-items:flex-end;gap:2px;margin-left:auto;min-width:0;max-width:55%}
.cc-ps{display:flex;align-items:center;justify-content:center;border-left:1.5px dashed #cfccc4}
.cc--highlighted{outline:2px solid #2f6fd1;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.cc-hint svg{transition:none}.cc-ticket:active{transform:none}}
```

- [ ] **Step 3: 빌드**

Run: `cd web && npm run build`
Expected: 성공. `CouponCard`는 아직 어디서도 쓰지 않아 번들에 안 들어간다(트리 셰이킹).

- [ ] **Step 4: 커밋**

```bash
git add web/src/CouponCard.jsx web/src/styles/coupon-card.css
git commit -m "feat(web): 쿠폰 브랜드 카드 컴포넌트(16차 시안), 아직 연결하지 않음"
```

---

### Task 4: `?home=a`로 켜고 프리뷰에서 재기

**Files:**
- Modify: `web/src/App.jsx`(카드 목록을 그리는 곳, 지금 `<BrandCard` 한 곳)

**Interfaces:**
- Consumes: Task 3 `CouponCard`

- [ ] **Step 1: 연결**

```jsx
// web/src/App.jsx 상단 import 옆
import { lazy } from 'react' // 이미 있으면 그대로
const CouponCard = lazy(() => import('./CouponCard.jsx'))
```

```jsx
// App() 안, 다른 useState 옆. 서버 렌더링 첫 화면은 늘 운영 카드다(하이드레이션 일치).
// 마운트 뒤 주소에 ?home=a가 있으면 쿠폰 카드로 바꾼다. 반반 배정은 5단계에서 한다.
const [homeA, setHomeA] = useState(false)
useEffect(() => {
  try { if (new URLSearchParams(window.location.search).get('home') === 'a') startTransition(() => setHomeA(true)) } catch { /* 주소를 못 읽으면 운영 카드 */ }
}, [])
```

```jsx
// 카드 목록: <BrandCard ... /> 를 아래로 바꾼다
{visibleBrands.slice(0, shown).map((b, index) => {
  const props = { leaving: leaving === b.name, onHide, include, brand: b, position: index + 1,
    highlighted: linkedBrand === brandCardId(b.name), onInteract: clearLinked }
  return homeA
    ? <Suspense key={b.name} fallback={<BrandCard {...props} />}><CouponCard {...props} /></Suspense>
    : <BrandCard key={b.name} {...props} />
})}
```

- [ ] **Step 2: 테스트, 빌드, 하이드레이션 확인**

Run: `cd web && npm test && npm run build`
Expected: 실패 0, 빌드 성공.

React 개발 빌드로 로컬 서버 렌더링을 띄워 `/?home=a`와 `/`를 열고, 콘솔에 하이드레이션 경고가 0건인지 본다(SSR 스파이크 때 쓴 방법: `api/ssr.js`의 `inject`와 같은 방식으로 `vite build --mode development` 결과를 서빙).

- [ ] **Step 3: 프리뷰와 360px 확인**

```bash
git add web/src/App.jsx
git commit -m "feat(web): 주소 끝 ?home=a면 쿠폰 브랜드 카드로 그린다(미리보기용)"
SPLIT=$(git subtree split --prefix web HEAD | tail -1)
git push -f web-mirror "$SPLIT:refs/heads/preview/home-a-card"
```

프리뷰 주소에 `?home=a&dev=1`을 붙여 360px로 찍는다. 확인할 것:
- 쿠폰이 시안 8판과 같은 모양이다.
- 동점 브랜드(도미노피자, 꾸브라꼬숯불치킨)에서 글자가 줄바꿈되지 않는다.
- 긴 이름(토핑몬스터피자TMPPIZZA)이 한 줄이다.
- 펼침과 접기가 되고, 펼친 쿠폰을 누르면 앱으로 간다.
- `#brand-청년피자`로 들어오면 펼친 채로 스크롤된다.

- [ ] **Step 4: 성능 판정**

기준(`?dev=1`)과 쿠폰 카드(`?home=a&dev=1`)를 같은 프리뷰에서 실제 속도 제한 방식(`--throttling-method=devtools`)으로 번갈아 12회씩 잰다. 프리뷰 보호는 쿠키 방식(`x-vercel-set-bypass-cookie=true`)으로 넘는다. 우회 헤더는 jsdelivr 글꼴 요청을 깨뜨리므로 쓰지 않는다.

통과 기준:
- 총 차단 시간: 짝비교 중앙값이 +100ms를 넘지 않는다.
- 최대 콘텐츠 표시 시간: 짝비교 중앙값이 +100ms를 넘지 않는다.
- 누적 레이아웃 이동: 모든 실행에서 0.1 이하다.
- 화면 요소 수가 기준 이하다.

결과를 `mono/docs/metrics/`에 한 줄 기록하고 사용자 승인을 받는다. 승인 전에는 main에 합치지 않는다.

---

## Self-Review 결과

- **설계 커버리지:** 9차~16차의 카드 항목(New 제외)이 Task 1, Task 3에 있다. New는 2단계 계획으로 넘겼다(데이터가 아직 없다). 상단, 배너, 반반 배정도 다음 계획이다.
- **자리표시 확인:** "TBD"나 "적절히" 같은 빈칸이 없다. CSS는 시안 값을 그대로 적었다.
- **이름 일치:** `splitOffers`, `minLabel`, `formulaOf`, `badgesOf`, `sharedBadges`, `nameFontPx`, `amountText`, `offerLink`, `offerClickProps`를 Task 1, Task 2에서 정의했고 Task 3에서 같은 이름으로 쓴다.
- **Review Focus:** 다섯 줄 중 1, 3, 5는 Task 1 테스트, 2는 Task 2 테스트, 4는 Task 4 Step 3 확인 항목이 맡는다.
