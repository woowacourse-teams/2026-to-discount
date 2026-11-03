// 시안 #257 '얼마 아끼나'의 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꿀 뿐이다.
// 계산은 최소주문과 입력 금액을 견주는 한 줄(settle)뿐이고 정렬, 판정, 금액 글자는 모두 기존 함수가 한다.
// .jsx는 node --test가 못 읽어서 테스트할 값은 전부 여기서 만든다.
import {
  CATEGORIES,
  applyFilters,
  comparable,
  defaultFilters,
  displayBestAmount,
  latestCaptured,
  lowestMinOrder,
  sortBrands,
} from '../../filters.js'
import { amountText, channelOf, chipsOf, minLabel, onCard } from '../../couponModel.js'
import { PLATFORMS } from '../../platforms.js'

export { CATEGORIES }
export const DEFAULT_ORDER_WON = 20000

/** 이 오퍼가 입력 금액으로 받을 수 있나: 'ok' | 'unknown'(최소주문 모름) | 'over'(최소주문 초과). 비교 한 줄. */
export function settle(offer, orderWon) {
  if (offer.minOrderAmount == null) return 'unknown'
  return offer.minOrderAmount <= orderWon ? 'ok' : 'over'
}

/** 최소주문 글자. 모르면 기존 정식 라벨(minLabel이 null일 때). */
export function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return '최소주문 미확인'
  return offer.minOrderAmount === 0 ? label : `최소주문 ${label}원`
}

const KST = 9 * 3600e3
const pad = (n) => String(n).padStart(2, '0')

/** "11월 3일 14:05 기준". 읽지 못하는 형식이면 원문을 그대로 쓴다(값을 조용히 잃지 않는다). null이면 null. */
export function capturedLabel(ts) {
  if (!ts) return null
  const t = Date.parse(ts)
  if (!Number.isFinite(t)) return String(ts)
  const d = new Date(t + KST)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} 기준`
}

/** 오퍼 하나를 카드용 모양으로. */
function shape(offer, brand) {
  return {
    offer,
    platform: offer.platform,
    amount: offer.amount,
    amountText: amountText(offer),
    chips: chipsOf(offer).filter(onCard).map((c) => c.text),
    channel: channelOf(offer),
    minText: minText(offer),
    brand,
  }
}

/** 오퍼 중 금액이 가장 큰 것(동점이면 최소주문이 낮은 것). 견줄 수 있는 오퍼만 넣는다. */
function topOffer(offers) {
  const top = displayBestAmount(offers)
  if (top == null) return null
  return offers
    .filter((o) => comparable(o) && !o.soldOut && o.amount === top)
    .sort((a, b) => (a.minOrderAmount ?? Infinity) - (b.minOrderAmount ?? Infinity))[0]
}

/** 앱 한 칸. state: none(오퍼 없음) | ok | unknown(최소주문 모름) | over(입력 금액 모자람). */
function appCell(platform, offers, orderWon, brand) {
  const mine = offers.filter((o) => o.platform === platform.key && comparable(o) && o.amount != null && !o.soldOut)
  const pick = (state) => topOffer(mine.filter((o) => settle(o, orderWon) === state))
  for (const state of ['ok', 'unknown']) {
    const top = pick(state)
    if (top) return { ...shape(top, brand), platform, state }
  }
  const over = pick('over')
  if (over) return { ...shape(over, brand), platform, state: 'over' }
  return { platform, state: 'none' }
}

/**
 * 화면에 그릴 줄.
 * ranked: 입력 금액으로 받을 수 있는 할인이 있는 브랜드, 큰 숫자 내림차순.
 * unknown: 받을 수 있는 할인은 없고 최소주문을 모르는 할인만 있는 브랜드(순위와 섞지 않는다).
 * lowestMin: 필터를 통과한 브랜드 전체의 가장 낮은 최소주문(둘 다 비었을 때 안내용).
 */
export function savingsRows(brands, orderWon, categories = new Set()) {
  const visible = applyFilters(brands, { ...defaultFilters(), categories })
  const makeRow = (brand, offers) => {
    const best = topOffer(offers)
    return best && { name: brand.name, brand, best: shape(best, brand), apps: PLATFORMS.map((p) => appCell(p, brand.offers, orderWon, brand)), capturedAt: latestCaptured(brand.offers) }
  }
  const byState = (state) => visible
    .map((b) => ({ ...b, offers: b.offers.filter((o) => comparable(o) && o.amount != null && !o.soldOut && settle(o, orderWon) === state) }))
    .filter((b) => displayBestAmount(b.offers) != null)
  const okBrands = byState('ok')
  const okNames = new Set(okBrands.map((b) => b.name))
  const origin = new Map(visible.map((b) => [b.name, b]))
  const rowsOf = (list) => sortBrands(list, { sorts: [{ key: 'amount', dir: 'desc' }] })
    .map((b) => makeRow(origin.get(b.name), b.offers))
    .filter(Boolean)
  return {
    ranked: rowsOf(okBrands),
    unknown: rowsOf(byState('unknown').filter((b) => !okNames.has(b.name))),
    lowestMin: lowestMinOrder(visible.flatMap((b) => b.offers)),
  }
}
