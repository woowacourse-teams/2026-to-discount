// 굵은 타이포 시안(#242)의 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꿀 뿐 계산하지 않는다.
// 버리는 시안이라 병합하지 않는다. 판정(확실성, 정렬, 링크)은 기존 모듈 그대로다.
import { fetchBanners as defaultFetchBanners, fetchBrands as defaultFetchBrands } from '../../api.js'
import { CATEGORIES, applyFilters, defaultFilters, displayBestAmount, latestCaptured, sortBrands } from '../../filters.js'
import { amountText, chipsOf, minLabel, onCard } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { popularToday } from '../../popularStrip.js'

export const BOLD_CARD_LIMIT = 6
// 최소주문을 모를 때 그리는 기존 정식 라벨(couponModel.conditionTable). 이슈 #242 결정(2026-11-03).
export const MIN_UNKNOWN_LABEL = '최소주문 미확인'

export { CATEGORIES }

/** 가져오기만 한다. 실패하면 던진다. */
export async function loadBoldHome({ fetchers = {}, category = null } = {}) {
  const fetchBrands = fetchers.fetchBrands ?? defaultFetchBrands
  const fetchBanners = fetchers.fetchBanners ?? defaultFetchBanners
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners()])
  return buildBoldHome(brands, banners, { category })
}

/** 받은 데이터를 화면용 모양으로. category가 null이면 전체. */
export function buildBoldHome(brands, banners, { category = null } = {}) {
  // 이 호출이 없으면 배민 등 링크 없는 오퍼가 허브 폴백 없이 undefined 링크로 나간다.
  setHubLinks(banners)
  const all = brands ?? []
  const filters = defaultFilters()
  if (category) filters.categories = new Set([category])
  const include = false
  const sorted = sortBrands(applyFilters(all, filters), { sorts: filters.sorts, include })
  const rank = new Map(popularToday(all).map((p) => [p.brand?.name, p.rank]))

  const cards = []
  for (const brand of sorted) {
    if (cards.length >= BOLD_CARD_LIMIT) break
    const amount = displayBestAmount(brand.offers, include)
    const offer = amount == null ? null : brand.offers.find((o) => o.amount === amount && !o.soldOut)
    if (!offer) continue // 값을 지어내지 않는다
    const chips = chipsOf(offer).filter(onCard)
    cards.push({
      key: `${brand.name}#${offer.platform}`,
      brandName: brand.name,
      amount,
      amountText: amountText(offer),
      appChip: offer.platform,
      chips,
      minLabel: minLabel(offer.minOrderAmount),
      href: offerLink(offer, brand.links, brand.name),
      offer,
      brand,
      popularRank: rank.get(brand.name) ?? null,
    })
  }
  return {
    capturedAt: latestCaptured(all.flatMap((b) => b.offers ?? [])),
    categories: CATEGORIES,
    cards,
  }
}
