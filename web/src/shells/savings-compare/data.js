// 시안 savings-compare의 어댑터(#269). 기존 모듈이 내는 값을 껍데기용 모양으로 바꾸는 얇은 층이다.
// 이 파일의 새 비교는 cellState 하나(최소주문 <= 주문 금액, 받는 칸끼리 최대 금액)뿐이다.
// 어떤 오퍼가 견줄 수 있는지는 couponModel.splitOffers와 filters.comparable에 맡긴다.
import { applyFilters, comparable, defaultFilters, includesFrom, isBundle, latestCaptured, CATEGORIES } from '../../filters.js'
import { amountText, chipsOf, minLabel, splitOffers } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

export { CATEGORIES, PLATFORMS }

export const ORDER_AMOUNTS = [10000, 15000, 20000, 25000, 30000]
export const DEFAULT_ORDER_AMOUNT = 20000
export const UNKNOWN_MIN_TEXT = '최소주문 미확인' // couponModel.js conditionTable이 내는 정식 라벨과 같다

// 칸에 올리는 칩 종류와 순서. 한정 표시(불확정, 랜덤)가 먼저라 금액을 받는다고 오해하지 않게 한다.
const CHIP_KINDS = ['qualifier-plain', 'qualifier-random', 'condition', 'channel', 'membership']
const MAX_CHIPS = 2

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** 관측 시각 -> "MM.DD HH:mm"(한국 시각). 상대 시각("n분 전")은 렌더마다 달라져 쓰지 않는다. 없거나 못 읽으면 null. */
export function capturedLabel(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(KST.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`
}

export function minText(minOrderAmount) {
  if (minOrderAmount == null) return UNKNOWN_MIN_TEXT
  const label = minLabel(minOrderAmount)
  return minOrderAmount === 0 ? label : `최소주문 ${label}원`
}

/**
 * 칸 하나의 상태(이 시안의 유일한 새 비교). 'none' | 'unknown' | 'blocked' | 'ok'.
 * 'best'는 줄 전체를 본 뒤 rowOf가 ok 중에서 올린다.
 */
export function cellState(offer, orderAmount) {
  if (!offer) return 'none'
  if (offer.minOrderAmount == null) return 'unknown'
  return offer.minOrderAmount > orderAmount ? 'blocked' : 'ok'
}

function bestCandidate(cell, include) {
  const o = cell.offer
  return cell.state === 'ok' && o.amount != null && !o.soldOut && !isBundle(o) && comparable(o, include)
}

function cellOf(brand, platformKey, orderAmount, include) {
  const offers = brand.offers.filter((o) => o.platform === platformKey)
  if (offers.length === 0) {
    return { platform: platformKey, state: 'none', offer: null, amountText: null, minText: null, chips: [], href: null, soldOut: false }
  }
  const offer = splitOffers(offers, include).best[0]
  const chips = chipsOf(offer)
    .filter((c) => c.scope === 'offer' && CHIP_KINDS.includes(c.kind))
    .sort((a, b) => CHIP_KINDS.indexOf(a.kind) - CHIP_KINDS.indexOf(b.kind))
    .slice(0, MAX_CHIPS)
  return {
    platform: platformKey,
    state: cellState(offer, orderAmount),
    offer,
    amountText: amountText(offer),
    minText: minText(offer.minOrderAmount),
    chips,
    href: offerLink(offer, brand.links, brand.name),
    soldOut: !!offer.soldOut,
  }
}

/** 브랜드 한 줄. cells는 PLATFORMS 순서로 항상 네 칸. */
export function rowOf(brand, orderAmount, filters = defaultFilters()) {
  const include = includesFrom(filters)
  const cells = PLATFORMS.map((p) => cellOf(brand, p.key, orderAmount, include))
  const top = Math.max(-Infinity, ...cells.filter((c) => bestCandidate(c, include)).map((c) => c.offer.amount))
  for (const c of cells) if (bestCandidate(c, include) && c.offer.amount === top) c.state = 'best'
  return {
    name: brand.name,
    category: brand.category,
    brand,
    capturedAt: latestCaptured(brand.offers),
    cells,
  }
}

/** 화면에 그릴 줄들. 순서와 거르기는 applyFilters가 낸 그대로(주문 금액으로 다시 정렬하지 않는다). */
export function rowsOf(brands, orderAmount, categories = new Set(), filters = defaultFilters()) {
  const f = { ...filters, categories }
  return applyFilters(brands, f).map((b) => rowOf(b, orderAmount, f))
}

/** 전체 기준 시각: 모든 브랜드의 오퍼에 건 latestCaptured. */
export function overallCaptured(brands) {
  return latestCaptured(brands.flatMap((b) => b.offers))
}
