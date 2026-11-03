// 검색 먼저 홈 시안(#255)의 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 이름만 붙인다. 계산 금지.
import { defaultFilters, displayBestAmount, isBundle, latestCaptured, sortBrands } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { findBrandSuggestions } from '../../brandAutocomplete.js'
import { popularToday, STRIP_MIN, STRIP_SIZE } from '../../popularStrip.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

// 기존 정식 라벨(couponModel.js conditionTable의 min, 금액). 화면 쪽에 글자를 직접 두지 않도록 여기 한 곳에만 둔다.
export const MIN_UNKNOWN = '최소주문 미확인'
export const AMOUNT_UNKNOWN = '금액 ?'
export const NONE = '-'

export function frequentBrands(brands) {
  const popular = popularToday(brands).map((p) => p.brand).filter(Boolean)
  if (popular.length >= STRIP_MIN) return popular
  return sortBrands(brands, { sorts: defaultFilters().sorts }).slice(0, STRIP_SIZE)
}

export function searchBrands(brands, query) {
  return findBrandSuggestions(brands, query, 8)
}

function minText(offer) {
  const m = offer.minOrderAmount
  if (m == null) return MIN_UNKNOWN
  if (m === 0) return minLabel(0)
  return `${minLabel(m)}원↑`
}

function appOf(brand, platform) {
  const mine = brand.offers.filter((o) => o.platform === platform.key)
  if (mine.length === 0) return { platform, state: 'none', text: NONE, amount: null, link: undefined, minText: null, chips: [] }
  const rep = splitOffers(mine, false).best[0]
  const unknown = rep.amount == null && !isBundle(rep)
  return {
    platform,
    state: unknown ? 'unknownAmount' : 'known',
    text: amountText(rep) || AMOUNT_UNKNOWN,
    amount: rep.amount ?? null,
    link: offerLink(rep, brand.links, brand.name),
    minText: minText(rep),
    chips: headOrder(chipsOf(rep).filter(onCard)),
  }
}

export function cardOf(brand) {
  const offers = brand.offers ?? []
  const amount = displayBestAmount(offers)
  const apps = PLATFORMS.map((p) => appOf({ ...brand, offers }, p))
  const rep = offers.length ? splitOffers(offers, false).best[0] : null
  return {
    name: brand.name,
    category: brand.category,
    amount,
    // 금액이 없으면 대표 오퍼의 원문(1+1 묶음 같은 행사)
    amountFallback: amount == null && rep ? amountText(rep) : '',
    headChips: rep ? headOrder(chipsOf(rep).filter(onCard)) : [],
    apps,
    checkedAt: latestCaptured(offers),
  }
}
