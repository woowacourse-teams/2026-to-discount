// 카드 표준 껍데기용 얇은 어댑터. 기존 모듈의 결과를 화면용 모양으로만 바꾼다(계산 규칙 없음).
import { fetchBanners, fetchBrands } from '../../api.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { applyFilters, certaintyOf, defaultFilters, includesFrom, latestCaptured } from '../../filters.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'
import { STRIP_MIN, popularToday } from '../../popularStrip.js'

export async function loadHome() {
  const [brands, banners] = await Promise.all([
    fetchBrands(),
    fetchBanners().catch(() => []),
  ])
  if (banners.length > 0) setHubLinks(banners)
  return { brands, banners }
}

const UNKNOWN_AMOUNT = '금액 ?'
const amountOf = (o) => amountText(o) || UNKNOWN_AMOUNT

function minTextOf(m) {
  if (m == null) return '최소주문 미확인'
  if (!(m > 0)) return minLabel(m)
  return `최소주문 ${minLabel(m)}원↑`
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const parts = (d) => Object.fromEntries(KST.formatToParts(d).map((p) => [p.type, p.value]))

export function capturedText(iso, now = new Date()) {
  if (!iso) return '시각 ?'
  const t = parts(new Date(iso))
  const n = parts(now)
  const y = parts(new Date(now.getTime() - 86400000))
  const hm = `${t.hour}:${t.minute}`
  const md = `${t.month}/${t.day}`
  if (md === `${n.month}/${n.day}`) return `오늘 ${hm} 기준`
  if (md === `${y.month}/${y.day}`) return `어제 ${hm} 기준`
  return `${md} ${hm} 기준`
}

export function toCards(brands, { categories = new Set() } = {}) {
  if (!brands) return []
  const base = defaultFilters()
  const include = includesFrom(base)
  const ranked = popularToday(applyFilters(brands, base))
  const rankOf = ranked.length >= STRIP_MIN ? new Map(ranked.map((r) => [r.brand.name, r.rank])) : new Map()
  const list = applyFilters(brands, { ...base, categories })
  return list.map((brand) => {
    const { best, hasBest } = splitOffers(brand.offers, include)
    const top = best[0]
    const cells = PLATFORMS.map((p) => {
      const mine = brand.offers.filter((o) => o.platform === p.key)
      if (mine.length === 0) return { key: p.key, label: p.label, initial: p.initial, text: '-', empty: true, on: false }
      const o = splitOffers(mine, include).best[0]
      return { key: p.key, label: p.label, initial: p.initial, text: amountOf(o), empty: false, on: o === top }
    })
    return {
      name: brand.name,
      top,
      platform: top.platform,
      soldOut: !!top.soldOut,
      amount: amountOf(top),
      chips: headOrder(chipsOf(top).filter(onCard)),
      minText: minTextOf(top.minOrderAmount),
      cells,
      capturedText: capturedText(latestCaptured(brand.offers)),
      confirmed: hasBest && certaintyOf(top) === 'exact',
      href: offerLink(top, brand.links, brand.name),
      popularRank: rankOf.get(brand.name) ?? null,
    }
  })
}
