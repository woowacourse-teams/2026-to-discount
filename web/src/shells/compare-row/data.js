// 비교표 시안(#233)의 얇은 어댑터. 기존 모듈을 불러 표 모양으로 바꾸기만 한다.
// 판정, 정렬, 금액 비교를 여기서 새로 쓰지 않는다(설계 docs/design/233-compare-row-shell.md §3-2).
import { fetchBanners, fetchBrands } from '../../api.js'
import { CATEGORIES, applyFilters, defaultFilters, includesFrom, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, shortBrandName, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

const STAMP = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})

/** ISO 시각 → `MM.dd HH:mm`(서울). 없으면 null. 표시 서식뿐이다. */
export function stampText(iso) {
  if (!iso) return null
  const p = Object.fromEntries(STAMP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`
}

// 칸의 오퍼는 그 앱 오퍼의 splitOffers 대표, 최고 강조는 브랜드 전체 splitOffers의 best에 들었는지로 가른다(동점은 전부).
function cellOf(brand, platform, include, brandSplit) {
  const offers = brand.offers.filter((o) => o.platform === platform)
  if (offers.length === 0) return { platform, offer: null }
  const offer = splitOffers(offers, include).best[0]
  return {
    platform,
    offer,
    amountText: amountText(offer),
    min: minLabel(offer.minOrderAmount),
    chips: headOrder(chipsOf(offer).filter(onCard)),
    isTop: brandSplit.hasBest && brandSplit.best.includes(offer),
    href: offerLink(offer, brand.links, brand.name),
  }
}

/** 브랜드 목록 → 표 행. 거르기와 순서는 applyFilters(운영 홈 기본값) 그대로. */
export function buildRows(brands, categories = new Set()) {
  const filters = { ...defaultFilters(), categories }
  const include = includesFrom(filters)
  const rows = applyFilters(brands, filters).map((brand) => {
    const captured = latestCaptured(brand.offers)
    const brandSplit = splitOffers(brand.offers, include)
    return {
      name: brand.name,
      shortName: shortBrandName(brand),
      captured,
      stamp: stampText(captured),
      cells: PLATFORMS.map((p) => cellOf(brand, p.key, include, brandSplit)),
    }
  })
  return { rows, stamp: stampText(latestCaptured(rows.map((r) => ({ capturedAt: r.captured })))) }
}

export async function loadCompareRows() {
  // 배너가 실패해도 표는 그린다(허브 링크만 빈다).
  const [brands] = await Promise.all([
    fetchBrands(),
    fetchBanners().then(setHubLinks, () => {}),
  ])
  return { brands, ...buildRows(brands), categories: CATEGORIES }
}
