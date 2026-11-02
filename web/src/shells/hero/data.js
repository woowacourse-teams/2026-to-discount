// 홈 리뉴얼 시안 "오늘의 한 장"(#231)의 얇은 어댑터. 기존 모듈이 낸 값을 껍데기용 모양으로 담을 뿐이다.
// 새 판정, 정렬, 금액 계산을 두지 않는다(설계 docs/design/231-hero-shell-home-mock.md §3-2).
import { applyFilters, defaultFilters, includesFrom, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'

export const LIST_MAX = 7

function cardOf(brand, include) {
  const { best, hasBest } = splitOffers(brand.offers, include)
  const offer = best[0]
  if (!offer) return null
  return {
    brandName: brand.name,
    brand,
    offer,
    hasBest,
    amountLabel: amountText(offer),
    platform: offer.platform,
    chips: headOrder(chipsOf(offer).filter(onCard)).map((c) => c.text),
    minLabel: minLabel(offer.minOrderAmount),
    href: offerLink(offer, brand.links, brand.name),
  }
}

export function toHeroModel(brands) {
  if (!Array.isArray(brands) || brands.length === 0) return { hero: null, list: [], checkedAt: null }
  const filters = defaultFilters()
  const include = includesFrom(filters)
  const cards = applyFilters(brands, filters).map((b) => cardOf(b, include)).filter(Boolean)
  const hero = cards.find((c) => c.hasBest) ?? null
  const list = cards.filter((c) => c !== hero).slice(0, LIST_MAX)
  return { hero, list, checkedAt: latestCaptured(brands.flatMap((b) => b.offers)) }
}
