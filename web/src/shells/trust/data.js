// trust 시안(#235)의 얇은 어댑터. 기존 모듈 반환을 껍데기용 모양으로 모은다. 계산 로직은 agoText 하나뿐이다.
import { fetchBanners, fetchBrands } from '../../api.js'
import { applyFilters, certaintyOf, defaultFilters, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

export async function loadHome() {
  // 배너가 실패해도 브랜드는 그린다. 허브 링크만 빠진다(링크 사다리의 다음 단계로 떨어진다).
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return { brands }
}

export const visibleBrands = (brands) => applyFilters(brands, defaultFilters())

export function lastChecked(brands) {
  return latestCaptured(brands.map((b) => latestCaptured(b.offers ?? [])).filter(Boolean).map((capturedAt) => ({ capturedAt })))
}

export function cardOf(brand) {
  const best = splitOffers(brand.offers).best[0]
  const certainty = certaintyOf(best)
  return {
    name: brand.name,
    amount: amountText(best),
    min: minLabel(best.minOrderAmount),
    minOrderAmount: best.minOrderAmount,
    chips: headOrder(chipsOf(best).filter(onCard)).map((c) => c.text),
    certainty,
    capturedAt: latestCaptured(brand.offers),
    link: offerLink(best, brand.links, brand.name),
    platform: PLATFORM_BY_KEY[best.platform]?.label ?? null,
    // 앱별 대표 금액. 그 앱에 오퍼가 없으면 null(화면은 "-")
    apps: PLATFORMS.map((p) => {
      const mine = brand.offers.filter((o) => o.platform === p.key)
      return { label: p.label, amount: mine.length ? amountText(splitOffers(mine).best[0]) : null }
    }),
  }
}

/** 시각 → "방금", "N분 전", "N시간 전", "M월 D일". 미래이거나 못 읽으면 null(줄을 안 그린다). */
export function agoText(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const s = (now - t) / 1000
  if (s < 0) return null
  if (s < 60) return '방금'
  if (s < 3600) return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  const d = new Date(t)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
