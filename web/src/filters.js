// 필터·정렬 규칙. 시트(FilterSheet)와 메뉴바(MenuBar), 목록(App)이 같은
// 규칙을 봐야 해서 한곳에 모은다 — 세 군데가 각자 판단하면 "시트에서 고른
// 것"과 "화면에 뜬 것"이 어긋난다.

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

export const SORT_KEYS = [
  { key: 'amount', label: '할인액' },
  { key: 'minOrder', label: '최소주문금액' },
]

// Set이 들어 있어 상수 하나를 돌려쓰면 한쪽에서 고친 게 다른 쪽에
// 새어 나간다. 부를 때마다 새로 만든다.
export function defaultFilters() {
  return { ...DEFAULT_SCALARS, platforms: new Set(PLATFORMS.map((p) => p.key)), categories: new Set() }
}

const DEFAULT_SCALARS = {
  sortKey: 'amount',
  // 할인액은 큰 게 좋고 최소주문금액은 작은 게 좋다 — 방향의 기본값을
  // 기준마다 다르게 두면 기준을 바꿀 때마다 순서가 뒤집혀 놀란다.
  // 방향은 사용자가 정한 값을 그대로 유지하고, 처음만 내림차순으로 연다.
  sortDir: 'desc',
  search: '',
}

export function isDefaultFilters(f) {
  return f.platforms.size === PLATFORMS.length
    && f.categories.size === 0
    && f.sortKey === DEFAULT_SCALARS.sortKey
    && f.sortDir === DEFAULT_SCALARS.sortDir
    && f.search.trim() === ''
}

/**
 * 그 카드의 최고 확정 할인액. 조건이 붙은 값(qualifier)과 품절은 뺀다 —
 * "최대"는 최소주문금액을 채워야 나오는 상한액이고 "특정메뉴"는 메뉴
 * 하나에만 쓰는 값이라, 같은 선에서 견줄 수 없다. 카드의 "최고 할인"
 * 배지가 고르는 값과 같은 규칙이다.
 */
export function bestConfirmedAmount(offers) {
  const plain = offers.filter((o) => !o.qualifier && o.amount != null && !o.soldOut)
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
export function sortBrands(brands, { sortKey, sortDir }) {
  const value = (b) => (sortKey === 'minOrder'
    ? lowestMinOrder(b.offers)
    : bestConfirmedAmount(b.offers))

  const dir = sortDir === 'asc' ? 1 : -1

  return [...brands].sort((a, b) => {
    // 확정이 없는 브랜드는 어떤 기준으로도 뒤에 둔다(API와 같은 규칙).
    const aConfirmed = bestConfirmedAmount(a.offers) != null
    const bConfirmed = bestConfirmedAmount(b.offers) != null
    if (aConfirmed !== bConfirmed) return aConfirmed ? -1 : 1

    const av = value(a)
    const bv = value(b)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (av !== bv) return (av - bv) * dir
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
      const offers = b.offers.filter((o) => filters.platforms.has(o.platform))
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
