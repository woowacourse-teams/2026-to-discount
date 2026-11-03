// 알림 카드 시안(#260)의 데이터 어댑터. 계산은 기존 모듈이 하고, 여기서는 화면용 모양으로 묶기만 한다.
import { fetchBrands, fetchBanners } from '../../api.js'
import { applyFilters, defaultFilters, displayBestAmount, includesFrom, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

export const NO_MIN_LABEL = '최소주문 미확인' // 기존 정식 라벨(couponModel.conditionTable)

/** 두 fetch를 부르고 허브 링크까지 준비한다. */
export async function loadHome() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return brands
}

/** ISO 시각을 "n분 전" 글자로. 모르면 null. */
export function agoText(iso, now = Date.now()) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

/** 필터 기본값으로 거르고 정렬한 브랜드를 카드 모양으로 바꾼다. */
export function toCards(brands, categoryKey = null, now = Date.now()) {
  const filters = defaultFilters()
  if (categoryKey) filters.categories = new Set([categoryKey])
  const include = includesFrom(filters)
  return applyFilters(brands, filters).map((brand) => {
    const rows = PLATFORMS.map((p) => {
      const offers = brand.offers.filter((o) => o.platform === p.key)
      if (offers.length === 0) return { key: p.key, label: p.label, offer: false } // 없음
      const offer = splitOffers(offers, include).best[0]
      return {
        key: p.key,
        label: p.label,
        offer: true,
        amount: amountText(offer), // 금액을 모르면 rawText
        min: minLabel(offer.minOrderAmount) ?? NO_MIN_LABEL, // 모름
        chips: chipsOf(offer).filter(onCard).map((c) => c.text),
        href: offerLink(offer, brand.links, brand.name),
      }
    })
    const best = displayBestAmount(brand.offers, include)
    return {
      name: brand.name,
      category: brand.category,
      best: best != null ? `${best.toLocaleString('ko-KR')}원` : null,
      rows,
      ago: agoText(latestCaptured(brand.offers), now),
    }
  })
}

/** 가장 최근 값 시각(머리 줄). */
export function headAgo(brands, now = Date.now()) {
  return agoText(latestCaptured(brands.flatMap((b) => b.offers)), now)
}
