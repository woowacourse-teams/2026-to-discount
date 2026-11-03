// trust-compact 껍데기의 얇은 어댑터(#270). 계산은 기존 모듈이 하고 여기서는 화면용 모양으로 바꾼다.
// 새 계산은 ago() 하나(시각 글자 변환)뿐이다.
import { fetchBanners, fetchBrands } from '../../api.js'
import { applyFilters, defaultFilters, includesFrom, latestCaptured, visibleCategories } from '../../filters.js'
import { amountText, chipsOf, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** ISO 시각 → "3시간 전". 시각이 없거나 읽을 수 없으면 null(모르는 값을 "방금"으로 채우지 않는다). */
export function ago(iso, now = Date.now()) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const diff = Math.max(0, now - t)
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MIN))}분 전`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`
  return `${Math.floor(diff / DAY)}일 전`
}

/** 점 색: 1시간 안 fresh, 24시간 안 today, 그 뒤와 모름 old. 글자가 정본이고 색은 보조다. */
export function toneOf(iso, now = Date.now()) {
  if (!iso || Number.isNaN(Date.parse(iso))) return 'old'
  const diff = now - Date.parse(iso)
  if (diff < HOUR) return 'fresh'
  if (diff < DAY) return 'today'
  return 'old'
}

function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return '최소주문 미확인' // 기존 정식 라벨(couponModel.conditionTable과 같다)
  return offer.minOrderAmount === 0 ? label : `최소 ${label}원`
}

function rowOf(brand, include) {
  const rep = splitOffers(brand.offers, include).best[0]
  if (!rep) return null
  const chips = chipsOf(rep).filter(onCard)
  const apps = new Set(brand.offers.map((o) => o.platform))
  apps.delete(rep.platform)
  return {
    key: brand.name,
    name: brand.name,
    category: brand.category,
    amount: amountText(rep),
    platformLabel: PLATFORM_BY_KEY[rep.platform]?.label ?? OWN_LABEL,
    min: minText(rep),
    // 불확정, 랜덤, 특정메뉴는 신뢰 표시 쪽, 나머지는 조건 칩
    trustChips: chips.filter((c) => c.kind.startsWith('qualifier-')),
    chips: chips.filter((c) => !c.kind.startsWith('qualifier-')),
    extraApps: apps.size,
    capturedAt: rep.capturedAt ?? null,
    href: offerLink(rep, brand.links, brand.name),
  }
}

/** 운영 API에서 브랜드를 받아 줄 모양으로 바꾼다. 배너는 쿠팡이츠 허브 링크 폴백용으로만 읽는다(실패해도 무시). */
export async function loadHome() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  const filters = defaultFilters()
  const include = includesFrom(filters)
  const rows = applyFilters(brands, filters).map((b) => rowOf(b, include)).filter(Boolean)
  return {
    rows,
    updatedAt: latestCaptured(brands.flatMap((b) => b.offers)),
    categories: visibleCategories(brands),
  }
}
