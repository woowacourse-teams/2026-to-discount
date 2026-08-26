// 검색과 분류가 서로를 막지 않는지 확인한다.
//
// 실측(2026-08-24~25): 분류가 걸린 채 들어온 검색 제출 13건이 예외 없이
// 결과 0건이었다. 치킨을 켜둔 채 "피자"를 치면 둘이 AND로 걸려 아무것도
// 안 남는데, 검색은 "이걸 찾아 달라"는 말이라 그러면 안 된다.
//
// 고친 방식은 applyFilters를 건드리는 게 아니라 검색을 확정할 때 분류를
// 실제로 비우는 것이다(App.jsx submitSearch). 화면의 분류 칩도 같이
// 사라져서 걸린 조건과 보이는 것이 어긋나지 않는다.
//
// 그래서 여기서는 두 가지를 못박는다.
//   1) 분류가 남아 있으면 여전히 AND다 — 사용자가 검색 후 분류를 직접
//      고른 경우는 좁히려는 뜻이므로 그대로 둔다.
//   2) 분류를 비우면 검색어가 제 몫을 한다.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// filters.js는 플랫폼 목록 하나 때문에 logos.jsx를 부른다. node는 .jsx를
// 못 읽으므로 그 import만 같은 값의 인라인 선언으로 바꿔 불러온다 —
// 규칙 자체(applyFilters)는 원본 그대로다.
const source = await readFile(new URL('../src/filters.js', import.meta.url), 'utf8')
const patched = source.replace(
  /import \{ PLATFORMS \} from '\.\/logos\.jsx'/,
  "const PLATFORMS = ['baemin', 'coupangeats', 'ddangyo', 'yogiyo'].map((key) => ({ key }))",
)
if (patched === source) throw new Error('logos.jsx import를 못 찾았다 — 이 스텁을 고쳐야 한다')
const { applyFilters } = await import(
  `data:text/javascript;base64,${Buffer.from(patched, 'utf8').toString('base64')}`
)

const ALL = new Set(['baemin', 'coupangeats', 'ddangyo', 'yogiyo'])

const offer = (platform, amount) => ({
  platform, amount, qualifier: null, status: 'confirmed', rawText: `${amount}원`,
  capturedAt: '2026-08-25', minOrderAmount: null, tierMode: null, tiers: null,
  conditions: null, expiresAt: null, badge: null, soldOut: false, link: null,
})

const brands = [
  { name: '교촌치킨', category: 'chicken', links: {}, maxConfirmedAmount: 3000, offers: [offer('baemin', 3000)] },
  { name: '피자헛', category: 'pizza', links: {}, maxConfirmedAmount: 11000, offers: [offer('ddangyo', 11000)] },
  { name: '청년피자', category: 'pizza', links: {}, maxConfirmedAmount: 9000, offers: [offer('ddangyo', 9000)] },
]

const filters = (over = {}) => ({
  categories: new Set(), platforms: new Set(ALL), search: '',
  sortKey: 'best', sortDir: 'desc', ...over,
})

const names = (f) => applyFilters(brands, f, { cart: new Set(), cartOnly: false }).map((b) => b.name)

// 분류만 — 그 분류만 남는다
assert.deepEqual(names(filters({ categories: new Set(['chicken']) })), ['교촌치킨'])

// 검색만 — 이름이 겹치는 것만 남는다
assert.deepEqual(names(filters({ search: '피자' })).sort(), ['청년피자', '피자헛'])

// 문제였던 조합: 치킨을 켜둔 채 "피자"를 치면 0건이다.
// applyFilters는 여전히 AND다 — 고치는 자리는 여기가 아니라 submitSearch다.
assert.deepEqual(names(filters({ categories: new Set(['chicken']), search: '피자' })), [])

// submitSearch가 하는 일: 검색을 확정하면 분류를 비운다. 그러면 찾아진다.
assert.deepEqual(
  names(filters({ categories: new Set(), search: '피자' })).sort(),
  ['청년피자', '피자헛'],
)

// 앱 필터는 검색과 별개로 남는다 — "요기요에서 피자헛"은 없는 것이 맞다.
assert.deepEqual(names(filters({ platforms: new Set(['yogiyo']), search: '피자헛' })), [])

// 담아보기는 여전히 다른 모든 조건을 이긴다(기존 규칙).
const cartOnly = applyFilters(brands, filters({ categories: new Set(['pizza']) }),
  { cart: new Set(['교촌치킨']), cartOnly: true }).map((b) => b.name)
assert.deepEqual(cartOnly, ['교촌치킨'])

console.log('search/filter interaction: PASS')
