// 시안 new-ending(#236)의 얇은 어댑터. 값은 기존 모듈이 만들고, 여기서는 모양만 바꾼다.
// 새로 짠 판정은 "곧 끝남" 하나뿐이다(설계 §3-3).
import { fetchBanners, fetchBrands } from '../../api.js'
import { defaultFilters, isUpdated, latestCaptured, sortBrands } from '../../filters.js'
import { amountText, chipsOf, conditionTable, headOrder, minLabel, onCard } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'

export const ENDING_WITHIN_DAYS = 3

// filters.js kstDay와 같은 식(내보내지 않아 복사). 바꾸면 둘 다 바꾼다.
const kstDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10)
const DAY = /^\d{4}-\d{2}-\d{2}$/

function endsLabel(day, today, tomorrow) {
  if (day === today) return '오늘 끝'
  if (day === tomorrow) return '내일 끝'
  return `~${day.slice(5).replace('-', '.')}`
}

export function buildNewEnding(brands, now) {
  const t = now.getTime()
  const today = kstDay(t)
  const tomorrow = kstDay(t + 86400e3)
  const last = kstDay(t + ENDING_WITHIN_DAYS * 86400e3)
  const fresh = []
  const ending = []
  const counts = { offers: 0, fresh: 0, withExpiry: 0, ending: 0, soldOut: 0 }
  const all = []
  const sorted = sortBrands(brands, { sorts: defaultFilters().sorts })
  sorted.forEach((brand, rank) => {
    for (const [i, offer] of (brand.offers ?? []).entries()) {
      counts.offers++
      all.push(offer)
      if (offer.soldOut) { counts.soldOut++; continue }
      const day = typeof offer.expiresAt === 'string' && DAY.test(offer.expiresAt) ? offer.expiresAt : null
      const card = {
        key: `${brand.name}-${i}`,
        brand,
        offer,
        rank,
        href: offerLink(offer, brand.links, brand.name),
        amount: amountText(offer),
        // CouponCard MinOrder와 같은 꼴: 금액이면 "최소주문 N원↑", 0이면 "최소주문 없음", 모르면 기존 라벨
        min: offer.minOrderAmount > 0 ? `최소주문 ${minLabel(offer.minOrderAmount)}원↑` : (minLabel(offer.minOrderAmount) ?? '최소주문 미확인'),
        chips: headOrder(chipsOf(offer).filter(onCard)),
        note: conditionTable(offer).note,
        endsLabel: day ? endsLabel(day, today, tomorrow) : null,
      }
      if (isUpdated(offer, t)) fresh.push(card)
      if (day) {
        counts.withExpiry++
        if (day >= today && day <= last) ending.push(card)
      }
    }
  })
  ending.sort((a, b) => a.offer.expiresAt.localeCompare(b.offer.expiresAt) || a.rank - b.rank)
  counts.fresh = fresh.length
  counts.ending = ending.length
  return { fresh, ending, lastChecked: latestCaptured(all), counts }
}

export async function loadNewEnding() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return buildNewEnding(brands, new Date())
}
