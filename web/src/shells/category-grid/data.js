// 카테고리 먼저 시안(#238)의 얇은 어댑터. 계산하지 않는다: 기존 모듈을 불러 화면용 모양으로 이름만 바꿔 담는다.
// 금액은 반드시 displayBestAmount로 읽는다(특정메뉴 4,999원을 금액으로 찍는 사고 방지).
import { fetchBanners, fetchBrands } from '../../api.js'
import {
  CATEGORIES,
  applyFilters,
  defaultFilters,
  displayBestAmount,
  includesFrom,
  latestCaptured,
  visibleCategories,
} from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { OWN, OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'

/** 브랜드 실패는 던진다. 배너 실패는 빈 배열(부가 정보, App과 같은 규칙). */
export async function loadHome() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return brands
}

// 기본 필터에 분류만 얹는다.
function filtersFor(key) {
  const f = defaultFilters()
  f.categories = new Set([key])
  return f
}

// 같은 필터에서 낸 목록의 모양. 칸과 목록 줄이 이 변환 하나를 같이 쓴다.
export function rowOf(brand, include) {
  const base = { name: brand.name, capturedAt: latestCaptured(brand.offers) }
  if (displayBestAmount(brand.offers, include) == null) {
    return { ...base, amount: null, platform: null, minOrder: null, chips: [], href: null }
  }
  const offer = splitOffers(brand.offers, include).best[0]
  if (!offer) return { ...base, amount: null, platform: null, minOrder: null, chips: [], href: null }
  return {
    ...base,
    amount: amountText(offer),
    platform: offer.platform === OWN ? OWN_LABEL : (PLATFORM_BY_KEY[offer.platform]?.label ?? null),
    // 모르면 정식 라벨(이슈 결정 2026-11-03): 칸을 비우지 않는다.
    minOrder: minLabel(offer.minOrderAmount) ?? '최소주문 미확인',
    chips: headOrder(chipsOf(offer).filter(onCard)).map((c) => c.text),
    href: offerLink(offer, brand.links, brand.name) ?? null,
  }
}

/** 카테고리 목록 줄. 순서는 applyFilters 결과 그대로. */
export function brandsOf(brands, key) {
  return applyFilters(brands, filtersFor(key))
}

export function rowsOf(brands, key) {
  const include = includesFrom(filtersFor(key))
  return brandsOf(brands, key).map((b) => rowOf(b, include))
}

/** CATEGORIES 순서로 보일 칸. 1위 브랜드는 목록의 앞에서부터 금액이 있는 첫 브랜드. */
export function categoryTiles(brands) {
  return visibleCategories(brands).map(({ key, label }) => {
    const f = filtersFor(key)
    const include = includesFrom(f)
    const list = applyFilters(brands, f)
    const top = list.find((b) => displayBestAmount(b.offers, include) != null)
    const row = top ? rowOf(top, include) : null
    return {
      key,
      label,
      count: list.length,
      brandName: top ? top.name : null,
      amount: row?.amount ?? null,
      platform: row?.platform ?? null,
      minOrder: row?.minOrder ?? null,
      chips: row?.chips ?? [],
      capturedAt: row?.capturedAt ?? null,
      href: row?.href ?? null,
    }
  })
}

/** 그리드 전체에서 가장 늦은 시각. 값이 없으면 null. */
export function newestCaptured(tiles) {
  const ts = tiles.map((t) => t.capturedAt).filter(Boolean)
  return ts.length === 0 ? null : ts.reduce((a, b) => (a > b ? a : b))
}

const KST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** 한국 시각 `MM.DD HH:mm`. 브라우저 시간대에 의존하지 않는다. 읽을 수 없으면 null. */
export function kstStamp(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(KST.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`
}

export { CATEGORIES }
