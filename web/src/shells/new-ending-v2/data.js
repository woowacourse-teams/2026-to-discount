// 시안 new-ending-v2의 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꾸기만 한다.
// 판정(신규, 확실성, 금액 고르기)은 filters.js, couponModel.js가 한다. 여기서 다시 쓰지 않는다.
import { applyFilters, defaultFilters, displayBestAmount, isUpdated, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { OWN, OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'

// 시안이라 앞 10개만 그린다.
export const EXPIRING_LIMIT = 10

const platformLabel = (key) => (key === OWN ? OWN_LABEL : PLATFORM_BY_KEY[key]?.label ?? key)

// 최소주문: 모르면 기존 정식 라벨(칸을 비우지 않는다), 0이면 minLabel이 "최소주문 없음"을 낸다.
function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return '최소주문 미확인'
  return offer.minOrderAmount === 0 ? label : `${label}원↑`
}

function shape(brand, offer) {
  return {
    key: `${brand.name}|${offer.platform}|${offer.amount ?? offer.rawText ?? ''}`,
    brandName: brand.name,
    platform: platformLabel(offer.platform),
    amount: amountText(offer),
    chips: headOrder(chipsOf(offer).filter(onCard)).map((c) => c.text),
    min: minText(offer),
    href: offerLink(offer, brand.links, brand.name),
    expiresAt: offer.expiresAt ?? null,
  }
}

/** "오늘 새로 생긴 것": 신규 오퍼가 있는 브랜드마다 대표 금액을 낸 오퍼 하나. 브랜드 순서는 기본 목록 순서. */
export function newToday(brands) {
  const cards = []
  for (const brand of applyFilters(brands, defaultFilters())) {
    const fresh = brand.offers.filter((o) => isUpdated(o))
    const best = displayBestAmount(fresh)
    if (best == null) continue
    const offer = fresh.find((o) => o.amount === best && !o.soldOut)
    if (offer) cards.push(shape(brand, offer))
  }
  return cards
}

// 오늘(한국 시각) YYYY-MM-DD. filters.js의 kstDay가 내보내지 않아 같은 한 줄 변환을 둔다(설계 3-3).
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

/** "곧 끝나는 것": 종료일이 있고 오늘 이후인 오퍼. 종료일을 모르는 오퍼는 넣지 않는다(ADR-008). */
export function endingSoon(brands) {
  const today = kstToday()
  const rows = []
  for (const brand of brands) {
    for (const offer of brand.offers) {
      if (typeof offer.expiresAt === 'string' && offer.expiresAt >= today) rows.push({ offer, row: shape(brand, offer) })
    }
  }
  rows.sort((a, b) => (a.offer.expiresAt < b.offer.expiresAt ? -1 : a.offer.expiresAt > b.offer.expiresAt ? 1 : (b.offer.amount ?? 0) - (a.offer.amount ?? 0)))
  return rows.slice(0, EXPIRING_LIMIT).map(({ row }) => ({ ...row, until: `~${row.expiresAt.slice(5).replace('-', '.')}` }))
}

/** 가장 최근 수집 시각을 "MM.DD HH:mm"(한국 시각)로. 값이 없으면 null. */
export function capturedLabel(brands) {
  const t = latestCaptured(brands.flatMap((b) => b.offers))
  const ms = t ? Date.parse(t) : NaN
  if (!Number.isFinite(ms)) return null
  const s = new Date(ms + 9 * 3600e3).toISOString()
  return `${s.slice(5, 10).replace('-', '.')} ${s.slice(11, 16)}`
}
