// 앱별 탭 시안(#232)의 얇은 어댑터. 기존 모듈을 불러 껍데기용 모양으로 바꾼다. 계산 로직을 두지 않는다.
// 정렬, 5천원 거르기, 확정 판정은 filters.js가 한다. 여기서는 오퍼 배열을 자르고 필드 이름을 맞출 뿐이다.
import { fetchBanners, fetchBrands } from '../../api.js'
import { setHubLinks, offerLink } from '../../offerLink.js'
import { applyFilters, defaultFilters, displayBestAmount, includesFrom, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { PLATFORM_BY_KEY } from '../../platforms.js'

// 이슈가 정한 탭 순서. 키는 platforms.js의 PLATFORMS 키다.
export const TAB_KEYS = ['baemin', 'coupangeats', 'yogiyo', 'ddangyo']
// 탭 칸이 360px에 5개 들어가야 해서 배달의민족만 이슈가 부른 이름(배민)으로 줄인다. 나머지는 PLATFORMS.label 그대로.
const TAB_SHORT = { baemin: '배민' }
export const TABS = [{ key: 'all', label: '전체' }, ...TAB_KEYS.map((k) => ({ key: k, label: TAB_SHORT[k] ?? PLATFORM_BY_KEY[k].label }))]

/** 브랜드와 배너를 함께 부른다. 배너가 실패해도 브랜드는 그린다(허브 링크만 비어 앱 열기까지 내려간다). */
export async function loadHome() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return brands
}

/** 탭에 보일 브랜드. 앱 탭은 그 앱 오퍼만 남긴 뒤 기존 applyFilters에 맡긴다(자사앱 오퍼가 새지 않게). */
export function tabBrands(brands, tab) {
  const base = defaultFilters()
  if (tab === 'all') return applyFilters(brands, base)
  const cut = brands
    .map((b) => ({ ...b, offers: b.offers.filter((o) => o.platform === tab) }))
    .filter((b) => b.offers.length > 0)
  return applyFilters(cut, { ...base, platforms: new Set([tab]) })
}

/** 전체 브랜드 중 가장 최근 확인 시각. 없으면 null. */
export function newestCapture(brands) {
  return latestCaptured(brands.flatMap((b) => b.offers))
}

/** 브랜드 하나의 앱별 최고 금액. has=false는 그 앱에 오퍼가 없음(`-`), has=true인데 amount=null은 있되 금액을 모름. */
export function perApp(brand) {
  const include = includesFrom(defaultFilters())
  return TAB_KEYS.map((key) => {
    const offers = brand.offers.filter((o) => o.platform === key)
    return { key, has: offers.length > 0, amount: displayBestAmount(offers, include) }
  })
}

/** 화면용 카드. 대표 오퍼는 운영 카드와 같은 splitOffers가 고른다. */
export function cardOf(brand) {
  const include = includesFrom(defaultFilters())
  const offer = splitOffers(brand.offers, include).best[0]
  const chips = headOrder(chipsOf(offer).filter(onCard)).filter((c) => c.kind !== 'best-fit')
  return {
    name: brand.name,
    brand,
    offer,
    amount: amountText(offer),
    soldOut: !!offer.soldOut,
    chips,
    minLabel: minLabel(offer.minOrderAmount),
    minOrder: offer.minOrderAmount ?? null,
    capturedAt: offer.capturedAt ?? null,
    href: offerLink(offer, brand.links, brand.name),
  }
}
