// 필터·정렬 규칙. 상단 바(TopBarA)와 목록(App)이 같은
// 규칙을 봐야 해서 한곳에 모은다 — 각자 판단하면 "바에서 고른 것"과
// "화면에 뜬 것"이 어긋난다. (B안 시트·메뉴바는 2026-09-15에 지웠다.)

import { PLATFORMS, OWN } from './platforms.js'

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
  // 지역화폐(땡겨요)는 일단 뺀다(2026-09-19). 멤버십과 결이 달라 자리를 따로 정한 뒤 넣는다.
]
export const MEMBERSHIP_LABEL = Object.fromEntries(MEMBERSHIP_OPTIONS.map((m) => [m.key, m.label]))

// 정렬 기준(2026-09-19 개편). 방향이 있는 둘은 라벨 아래 높은순/낮은순 버튼, 나머지 둘은 칩 하나.
// 정렬은 하나만 고른다(2026-09-19). sortBrands는 여럿도 받지만 화면은 하나만 넘긴다.
export const SORT_KEYS = [
  { key: 'amount', label: '할인금액', directional: true },
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
  // 특정 메뉴 한정 쿠폰(qualifier "특정메뉴")을 "최고 할인" 산정과 정렬에 넣을지(2026-09-19).
  includeMenu: false,
  // 5,000원 이상 할인만(2026-09-19). 그 아래 오퍼를 카드에서 빼고, 남는 오퍼가 없는 카드는 숨긴다.
  minAmount5k: false,
  // 정렬은 하나다(2026-09-19). 처음은 할인액 높은 순.(2026-09-19, 사용자: 우선순위 개념 제거). 처음은 할인액 높은 순 하나.
  sorts: [{ key: 'amount', dir: 'desc' }],
  search: '',
}

export function isDefaultFilters(f) {
  return f.platforms.size === PLATFORMS.length
    && f.categories.size === 0
    && f.includeRandom === DEFAULT_SCALARS.includeRandom
    && f.includeMenu === DEFAULT_SCALARS.includeMenu
    && f.minAmount5k === DEFAULT_SCALARS.minAmount5k
    && sortSignature(f.sorts) === sortSignature(DEFAULT_SCALARS.sorts)
    && f.search.trim() === ''
}

/**
 * 이 오퍼의 확실성. API가 `certainty`를 항상 내려준다(RULES 11, Task 19) - Task 8부터
 * 서버가 옛 원장의 `qualifier`에서 끌어내 응답에 싣는 쪽으로 바뀌었으니, 웹이 그
 * 변환을 다시 할 필요가 없다.
 *
 * 옛 `CERTAINTY_FROM_QUALIFIER` 다리를 지웠다 - 이 앱은 서비스워커도, 응답을 오래
 * 붙드는 캐시도 없어(2026-09-23 확인) 배포가 끝난 뒤 `certainty` 없는 응답을 계속
 * 받을 길이 없다. 배포 겹침 순간에 옛 버전 API가 잠깐 응답해도 `?? 'exact'`가 같은
 * 값으로 떨어져 안전하고, 다음 새로고침이면 사라진다. `offer.qualifier` 자체는
 * 원장 호환으로 API에 남는다.
 */
export function certaintyOf(offer) {
  return offer.certainty ?? 'exact'
}

/** 이 오퍼의 종류. 아직 안 오면 할인으로 본다(옛 응답은 전부 할인이었다). */
export function kindOf(offer) {
  return offer.kind ?? 'discount'
}

/**
 * 확실성과 무관하게, 이 오퍼가 배달앱끼리 견주는 자리에 낄 수 있는가.
 *
 * api의 OfferComparison.comparable과 같은 축이다. 할인이어야 하고, 품절이
 * 아니어야 하고, 자사(own) 채널이 아니어야 한다. 자사는 오퍼 목록에는
 * 서지만 배달앱끼리 겨루는 "최고 할인" 자리에는 못 낀다(RULES 3).
 */
function comparableAxes(offer) {
  return kindOf(offer) === 'discount' && !offer.soldOut && offer.platform !== OWN
}

/**
 * 카드의 "최고 할인"으로 세울 수 있는 값인가.
 *
 * 같은 판정이 api의 OfferComparison.isBestCandidate에도 있다. 판정표
 * docs/contracts/certainty-cases.json을 양쪽 테스트가 같이 읽어 어긋남을
 * 막는다(ADR-016).
 */
export function isBestCandidate(offer) {
  return certaintyOf(offer) === 'exact' && comparableAxes(offer)
}

/** 특정 메뉴 한정 쿠폰이 정렬에서 갖는 값. 5,000원 바로 아래다. */
export const MENU_LIMITED_SORTING_AMOUNT = 4999

/**
 * 카드 정렬에 기여하는 금액. 견줄 수 없으면 null이라 아예 안 들어간다.
 *
 * api의 OfferComparison.sortingAmount와 같다. kind·soldOut·platform과
 * 무관하게 확실성만으로 정해진다(그 축은 comparableAxes가 이미 따로 본다).
 */
export function sortingAmount(offer) {
  const c = certaintyOf(offer)
  if (c === 'menuOnly') return MENU_LIMITED_SORTING_AMOUNT
  if (c === 'capped' || c === 'random' || c === 'percent') return null
  return offer.amount ?? null
}

export const RANDOM_QUALIFIER = '랜덤'
export function isRandom(offer) {
  return certaintyOf(offer) === 'random'
}

export const MENU_QUALIFIER = '특정메뉴'
export function isMenuOnly(offer) {
  return certaintyOf(offer) === 'menuOnly'
}

/** 넣을 것. `true`는 예전 호출(랜덤만)과 같다. 객체면 {random, menu}. */
function includesOf(include) {
  if (include === true) return { random: true, menu: false }
  if (!include) return { random: false, menu: false }
  return { random: !!include.random, menu: !!include.menu }
}

/**
 * 다른 오퍼와 같은 선에서 견줄 수 있는 값인가. `isBestCandidate`의 얇은
 * 겉옷이다 - exact 판정은 그 함수를 그대로 물려받고, 토글이 켜졌을 때만
 * 그 위에 랜덤·특정메뉴를 얹는다.
 *
 * 판정표(certainty-cases.json)는 사용자 설정을 모른다. "넣기"를 켠
 * 랜덤·특정메뉴는 그 표의 `best`가 아니어도 여기서는 낀다. 표가 답하는
 * 것은 "아무도 안 켰을 때의 기본값"이고, 토글은 그 위에 사용자가 얹는
 * 예외다. capped와 percent는 토글로도 못 넣는다. 상한과 정률은 액면이
 * 아예 없다.
 */
export function comparable(offer, include = false) {
  if (isBestCandidate(offer)) return true
  if (!comparableAxes(offer)) return false
  const inc = includesOf(include)
  const c = certaintyOf(offer)
  if (inc.random && c === 'random') return true
  if (inc.menu && c === 'menuOnly') return true
  return false
}

/**
 * 정렬 천장에 이 오퍼가 기여하는 금액. `bestConfirmedAmount`만 쓰는
 * 내부 함수다 - api의 `OfferComparison.comparisonAmount`처럼 `comparableAxes`와
 * `sortingAmount`(둘 다 판정표가 검사하는 함수)를 그대로 불러 쓴다.
 *
 * 특정메뉴는 토글이 꺼져 있어도 `sortingAmount`의 4,999원으로 정렬 천장에
 * 낀다 - 그 쿠폰뿐인 브랜드가 정렬 기준을 통째로 잃지 않게 하려는 것과
 * 같은 이유다(RULES 3, OfferComparison.java 주석). 토글을 켜면 액면
 * 그대로 올라간다 - "넣기"는 그 오퍼를 진짜 최고 후보로 승격하는
 * 사용자의 선택이라 4,999원 천장에 묶어 둘 이유가 없다. 랜덤도 같다:
 * 꺼져 있으면 sortingAmount가 null이라 안 낀다. 켜면 액면이 오른다.
 */
function comparisonAmount(offer, include) {
  if (!comparableAxes(offer)) return null
  const inc = includesOf(include)
  const c = certaintyOf(offer)
  if (inc.random && c === 'random') return offer.amount ?? null
  if (inc.menu && c === 'menuOnly') return offer.amount ?? null
  return sortingAmount(offer)
}

/**
 * 그 카드의 최고 확정 할인액. `comparisonAmount`를 오퍼마다 불러 최댓값을
 * 낸다. 견줄 수 없는 값(capped·percent, 토글 꺼진 random)은 null이라
 * 아예 안 낀다.
 */
export function bestConfirmedAmount(offers, include = false) {
  const amounts = offers.map((o) => comparisonAmount(o, include)).filter((v) => v != null)
  return amounts.length === 0 ? null : Math.max(...amounts)
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

function sortValue(brand, key, include) {
  if (key === 'minOrder') return lowestMinOrder(brand.offers)
  if (key === 'popularity') return brand.popularity ?? 0
  if (key === 'recent') return latestCaptured(brand.offers)
  return bestConfirmedAmount(brand.offers, include)
}

/** 필터 상태에서 "넣을 것"만 뽑는다. comparable/bestConfirmedAmount/sortBrands가 받는 꼴. */
export function includesFrom(f) {
  return { random: !!f.includeRandom, menu: !!f.includeMenu }
}

// 인기·최신은 방향 버튼이 없다. 항상 높은 순(많이 눌린 순, 최근 순).
const FIXED_DIR = { popularity: 'desc', recent: 'desc' }

export function sortBrands(brands, { sorts, includeRandom = false, include = null }) {
  const inc = include ?? includeRandom
  // 인기순·최신순은 "무엇으로 줄 세우나"라 고르면 맨 앞이다. 할인금액이 기본으로 켜져 있어
  // 뒤에 두면 인기순이 동점 처리에만 쓰여 눌러도 화면이 안 바뀐다(2026-09-19 실측).
  const PRECEDENCE = ['popularity', 'recent', 'amount', 'minOrder']
  const order = (k) => PRECEDENCE.indexOf(k)
  // 우선순위는 고른 순서가 아니라 고정(그 외 → 할인금액 → 최소주문금액).
  const keys = [...(sorts && sorts.length ? sorts : DEFAULT_SCALARS.sorts)]
    .sort((a, b) => order(a.key) - order(b.key))
    .map((s) => ({ key: s.key, dir: FIXED_DIR[s.key] ?? s.dir }))

  return [...brands].sort((a, b) => {
    // 확정이 없는 브랜드는 어떤 기준으로도 뒤에 둔다(API와 같은 규칙).
    const aConfirmed = bestConfirmedAmount(a.offers, inc) != null
    const bConfirmed = bestConfirmedAmount(b.offers, inc) != null
    if (aConfirmed !== bConfirmed) return aConfirmed ? -1 : 1

    // 앞 기준이 같을 때만 다음 기준으로 넘어간다.
    for (const { key, dir } of keys) {
      const av = sortValue(a, key, inc)
      const bv = sortValue(b, key, inc)
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
      const offers = b.offers.filter((o) => (o.platform === OWN || filters.platforms.has(o.platform))
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
  return sortBrands(visible, { ...filters, include: includesFrom(filters) })
}

/**
 * 오퍼 목록을 그릴 때 쓰는 React 키.
 *
 * 앱 이름만으로는 겹친다. 서버는 같은 (브랜드, 앱)에 확정 오퍼와 랜덤 오퍼를 따로
 * 세운다(BrandComparisonService의 slot이 `platform` 또는 `platform#random`이다).
 * 둘이 함께 서면 키가 같아져 React가 한 줄을 지우거나 엉뚱한 자리에 다시 그린다.
 * 서버가 가르는 기준을 그대로 쓴다.
 */
export function offerKey(offer) {
  return certaintyOf(offer) === 'random' ? `${offer.platform}#random` : offer.platform
}

/**
 * 그 브랜드 카드에 큰 글씨로 찍을 최고 할인액. 없으면 null.
 *
 * `bestConfirmedAmount`와 가르는 이유 - 그 함수는 정렬 천장을 채우려고 특정메뉴
 * 쿠폰뿐인 브랜드에 MENU_LIMITED_SORTING_AMOUNT(4,999원)를 끼워 넣는다. 화면에
 * 4,999원을 진짜 가격처럼 찍으면 안 된다. 여기서는 넣을지만 `comparable`로 가르고
 * 금액은 항상 오퍼의 액면을 쓴다.
 *
 * 규칙은 하나(RULES 3)인데 "정렬 순서"와 "화면에 찍을 값"이 갈라야 해서 두 함수가
 * 된다. 두 함수를 한 파일에 나란히 두는 이유가 그것이다 - App.jsx에 흩어져 있으면
 * 한쪽만 고쳐도 아무도 모른다(2026-09-24 지적).
 */
export function displayBestAmount(offers, include = false) {
  const plain = offers.filter((o) => comparable(o, include) && o.amount != null && !o.soldOut)
  return plain.length === 0 ? null : Math.max(...plain.map((o) => o.amount))
}
