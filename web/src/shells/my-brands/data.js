// 시안 "내 브랜드" 어댑터(#240). 기존 모듈이 주는 값을 화면용 모양으로 옮기기만 한다. 계산 로직 금지.
import { fetchBanners, fetchBrands } from '../../api.js'
import { CATEGORIES, applyFilters, defaultFilters, displayBestAmount, latestCaptured } from '../../filters.js'
import { amountText, channelOf, chipsOf, headOrder, minLabel, onCard, shortBrandName } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { STRIP_MIN, popularToday } from '../../popularStrip.js'
import { OWN, OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'

export { CATEGORIES }

// 최소주문을 모를 때 기존 상세 표가 쓰는 라벨(couponModel.js conditionTable). 새 문구가 아니다.
const MIN_UNKNOWN = '최소주문 미확인'

export async function loadHome() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return { brands, checkedAt: latestCaptured(brands.flatMap((b) => b.offers ?? [])) }
}

/** 기본 필터에 분류 한 칸만 얹은 목록. 정렬 규칙은 applyFilters가 낸다. */
export function orderedBrands(brands, category = null) {
  const filters = defaultFilters()
  if (category) filters.categories = new Set([category])
  return applyFilters(brands, filters)
}

/** 오늘 인기 상위(STRIP_MIN 이상일 때), 아니면 기본 정렬 상위 다섯. */
export function recommendedBrands(brands) {
  const popular = popularToday(brands).map((p) => p.brand).filter(Boolean)
  return popular.length >= STRIP_MIN ? popular : orderedBrands(brands).slice(0, 5)
}

/** 카드 한 장이 그릴 값. 대표 오퍼는 최고 할인액과 같은 amount의 첫 오퍼, 확정 오퍼가 없으면 첫 오퍼. */
export function cardOf(brand) {
  const offers = brand.offers ?? []
  const best = displayBestAmount(offers)
  const offer = (best != null ? offers.find((o) => o.amount === best && !o.soldOut) : null) ?? offers[0] ?? null
  if (!offer) return { brand, offer: null }
  const label = minLabel(offer.minOrderAmount)
  const chips = headOrder(chipsOf(offer).filter(onCard)).filter((c) => c.kind !== 'channel').map((c) => c.text)
  return {
    brand,
    offer,
    name: shortBrandName(brand),
    amount: amountText(offer),
    soldOut: !!offer.soldOut,
    platform: offer.platform === OWN ? OWN_LABEL : (PLATFORM_BY_KEY[offer.platform]?.label ?? offer.platform),
    channel: channelOf(offer),
    chips,
    min: label == null ? MIN_UNKNOWN : (offer.minOrderAmount > 0 ? `최소주문 ${label}원` : label),
    capturedAt: offer.capturedAt ?? null,
    href: offerLink(offer, brand.links, brand.name),
  }
}
