// 필터·정렬 규칙. 상단 바(TopBarA)와 목록(App)이 같은
// 규칙을 봐야 해서 한곳에 모은다 — 각자 판단하면 "바에서 고른 것"과
// "화면에 뜬 것"이 어긋난다. (B안 시트·메뉴바는 2026-09-15에 지웠다.)

import { PLATFORMS } from './logos.jsx'

// 필터 탭 목록. key는 API가 내려주는 brand.category 값과 맞춰야 한다
// (실제 브랜드별 분류는 API 쪽 brands.yml이 단일 출처다).
//
// "전체"는 항목이 아니다. 복수 선택에서 전체는 "아무것도 안 고른 상태"라
// 별도 버튼을 두면 "전체 + 치킨"처럼 뜻이 겹치는 조합이 생긴다.
export const CATEGORIES = [
  { key: 'chicken', label: '치킨' },
  { key: 'pizza', label: '피자' },
  { key: 'fastfood', label: '패스트푸드' },
  { key: 'snack', label: '분식' },
  { key: 'cafe', label: '카페' },
  { key: 'convenience', label: '편의점' },
  { key: 'korean', label: '한식' },
  { key: 'chinese', label: '중식' },
  { key: 'western', label: '양식' },
]

// 멤버십/지역화폐 반영 로직은 아직 없다. delivery-discount-api 레포의
// docs/specs/2026-07-28-product-brief.md에 "UI만 배치, 로직 보류"로 명시된
// 의도적 보류 상태 — 계산 모델이 나오면 그 레포 docs/plans에 계획이 생긴다.
export const MEMBERSHIP_OPTIONS = [
  { key: 'baemin', label: '배민클럽' },
  { key: 'coupangeats', label: '쿠팡와우' },
  { key: 'yogiyo', label: '요기패스' },
  { key: 'ddangyo', label: '지역화폐' },
]
export const MEMBERSHIP_LABEL = Object.fromEntries(MEMBERSHIP_OPTIONS.map((m) => [m.key, m.label]))

// 정렬 기준(2026-09-19 개편). 방향이 있는 둘은 라벨 아래 높은순/낮은순 버튼, 나머지 둘은 칩 하나.
// 복수 선택: 고른 순서대로 1차, 2차 … 기준이 된다.
export const SORT_KEYS = [
  { key: 'amount', label: '할인액', directional: true },
  { key: 'minOrder', label: '최소주문금액', directional: true },
  { key: 'popularity', label: '인기순', directional: false },
  { key: 'recent', label: '최신순', directional: false },
]
export const SORT_LABEL = Object.fromEntries(SORT_KEYS.map((s) => [s.key, s.label]))

/** 정렬 하나를 "amount_desc" 꼴로. 계측과 격자 키가 쓴다. */
export function sortSignature(sorts) {
  return (sorts || []).map((s) => `${s.key}_${s.dir}`).join('+') || 'none'
}

/** 첫 번째 정렬. 빠른 필터와 옛 호출부가 쓴다. */
export function primarySort(f) {
  return f.sorts?.[0] ?? { key: 'amount', dir: 'desc' }
}

// Set이 들어 있어 상수 하나를 돌려쓰면 한쪽에서 고친 게 다른 쪽에
// 새어 나간다. 부를 때마다 새로 만든다.
export function defaultFilters() {
  return { ...DEFAULT_SCALARS, platforms: new Set(PLATFORMS.map((p) => p.key)), categories: new Set() }
}

const DEFAULT_SCALARS = {
  // 뽑기 쿠폰(qualifier "랜덤")을 "최고 할인" 산정과 정렬에 넣을지(2026-09-18).
  // 목록에서 빼는 것이 아니다 — 카드에는 늘 보인다. 기본은 안 넣는다: 내가 뽑은
  // 값을 그 브랜드의 최고로 세우면 다른 사람에게는 거짓이다.
  includeRandom: false,
  // 5,000원 이상 할인만(2026-09-19). 그 아래 오퍼를 카드에서 빼고, 남는 오퍼가 없는 카드는 숨긴다.
  minAmount5k: false,
  // 고른 순서가 우선순위다. 처음은 할인액 높은 순 하나.
  sorts: [{ key: 'amount', dir: 'desc' }],
  search: '',
}

export function isDefaultFilters(f) {
  return f.platforms.size === PLATFORMS.length
    && f.categories.size === 0
    && f.includeRandom === DEFAULT_SCALARS.includeRandom
    && f.minAmount5k === DEFAULT_SCALARS.minAmount5k
    && sortSignature(f.sorts) === sortSignature(DEFAULT_SCALARS.sorts)
    && f.search.trim() === ''
}

/**
 * 다른 오퍼와 같은 선에서 견줄 수 있는 값인가.
 *
 * "최대"(화면 배지 "불확정")는 최소주문금액을 채워야 나오는 상한액이고
 * "랜덤"(뽑기 쿠폰. 받는 사람마다 값이 다르다)은 오늘 내가 뽑은 값일 뿐이며
 * "특정메뉴"는 메뉴 하나에만 쓰는 값이라 액면 그대로 견주면 그 오퍼가
 * 실제보다 세 보인다. "최적"(쿠폰을 다 겹쳤을 때)과 "행사"(당일 배너)는
 * 조건이 붙을 뿐 액수 자체는 확정이라 넣는다.
 *
 * 같은 규칙이 api의 BrandComparisonService.confirmedSortingAmount()에도
 * 있다(카드 정렬용). 한쪽만 고치면 API가 준 순서와 화면이 다시 세운 순서가
 * 어긋난다(ADR-016).
 */
const INCOMPARABLE = new Set(['최대', '랜덤', '특정메뉴'])

export const RANDOM_QUALIFIER = '랜덤'
export function isRandom(offer) {
  return offer.qualifier === RANDOM_QUALIFIER
}

export function comparable(offer, includeRandom = false) {
  if (includeRandom && isRandom(offer)) return true
  return !INCOMPARABLE.has(offer.qualifier)
}

/**
 * 그 카드의 최고 확정 할인액. 견줄 수 없는 값과 품절은 뺀다. 카드의
 * "최고 할인" 배지가 고르는 값과 같은 규칙이다 — App.jsx가 이 함수의
 * 판정(comparable)을 그대로 가져다 쓴다.
 */
export function bestConfirmedAmount(offers, includeRandom = false) {
  const plain = offers.filter((o) => comparable(o, includeRandom) && o.amount != null && !o.soldOut)
  return plain.length === 0 ? null : Math.max(...plain.map((o) => o.amount))
}

/** 그 카드에서 가장 낮은 최소주문금액. 못 읽은 값은 없는 것으로 친다. */
export function lowestMinOrder(offers) {
  const known = offers.map((o) => o.minOrderAmount).filter((v) => v != null)
  return known.length === 0 ? null : Math.min(...known)
}

/**
 * API가 준 순서 위에 사용자가 고른 기준으로 다시 세운다.
 *
 * <p>API는 이미 "확정 할인 큰 순, 확정 없는 브랜드는 전부 뒤로"로 내려준다
 * (BrandComparison.byBestDiscount). 그 규칙을 여기서도 지켜야 정렬 기준을
 * 바꿨을 뿐인데 불확정 브랜드가 위로 튀어오르지 않는다. 확정 유무를 먼저
 * 가르고, 같은 군 안에서만 고른 기준으로 견준다.
 *
 * <p>기준값이 없는 카드(최소주문금액을 하나도 못 읽은 경우)는 그 군의 맨
 * 뒤로 보낸다 — 방향과 무관하다. 모르는 값을 0이나 무한대로 치면 오름차순
 * 맨 앞이나 내림차순 맨 앞에 엉뚱하게 올라온다.
 */
/** 가장 최근 관측 시각. 최신순이 쓴다. 없으면 null. */
export function latestCaptured(offers) {
  const ts = offers.map((o) => o.capturedAt).filter(Boolean)
  return ts.length === 0 ? null : ts.reduce((a, b) => (a > b ? a : b))
}

function sortValue(brand, key, includeRandom) {
  if (key === 'minOrder') return lowestMinOrder(brand.offers)
  if (key === 'popularity') return brand.popularity ?? 0
  if (key === 'recent') return latestCaptured(brand.offers)
  return bestConfirmedAmount(brand.offers, includeRandom)
}

// 인기·최신은 방향 버튼이 없다. 항상 높은 순(많이 눌린 순, 최근 순).
const FIXED_DIR = { popularity: 'desc', recent: 'desc' }

export function sortBrands(brands, { sorts, includeRandom = false }) {
  const keys = (sorts && sorts.length ? sorts : DEFAULT_SCALARS.sorts)
    .map((s) => ({ key: s.key, dir: FIXED_DIR[s.key] ?? s.dir }))

  return [...brands].sort((a, b) => {
    // 확정이 없는 브랜드는 어떤 기준으로도 뒤에 둔다(API와 같은 규칙).
    const aConfirmed = bestConfirmedAmount(a.offers, includeRandom) != null
    const bConfirmed = bestConfirmedAmount(b.offers, includeRandom) != null
    if (aConfirmed !== bConfirmed) return aConfirmed ? -1 : 1

    // 고른 순서대로 견준다. 앞 기준이 같을 때만 다음 기준으로 넘어간다.
    for (const { key, dir } of keys) {
      const av = sortValue(a, key, includeRandom)
      const bv = sortValue(b, key, includeRandom)
      if (av == null && bv == null) continue
      if (av == null) return 1
      if (bv == null) return -1
      if (av !== bv) {
        const d = dir === 'asc' ? 1 : -1
        return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * d
      }
    }
    // 값이 같으면 이름으로 고정한다 — 안 그러면 같은 입력에 순서가 흔들린다.
    return a.name.localeCompare(b.name, 'ko')
  })
}

/**
 * 필터를 적용한 목록. 플랫폼 토글은 카드를 거르는 게 아니라 그 앱의
 * 오퍼를 켜고 끈다 — 끈 앱 금액이 카드에 남아 있으면 토글이 무슨 일을
 * 했는지 알 수 없고 "최고 할인"도 끈 앱 값으로 잡힌다.
 */
export function applyFilters(brands, filters, { cart, cartOnly } = {}) {
  const q = filters.search.trim()
  const visible = brands
    .map((b) => {
      const offers = b.offers.filter((o) => filters.platforms.has(o.platform)
        && (!filters.minAmount5k || (o.amount ?? 0) >= 5000))
      return offers.length === b.offers.length ? b : { ...b, offers }
    })
    .filter((b) => {
      if (b.offers.length === 0) return false
      // 담아둔 것만 보기. 다른 조건보다 먼저 건다 — 담아둔 브랜드를
      // 보러 왔는데 분류 필터에 걸려 안 보이면 담은 의미가 없다.
      if (cartOnly) return cart.has(b.name)
      if (q !== '' && !b.name.includes(q)) return false
      // 아무 분류도 안 고르면 전체다.
      if (filters.categories.size === 0) return true
      return filters.categories.has(b.category)
    })
  return sortBrands(visible, filters)
}
