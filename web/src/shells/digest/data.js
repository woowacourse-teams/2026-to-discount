// 오늘 요약판(digest) 시안의 얇은 어댑터(#259). 기존 모듈을 불러 화면용 모양으로 바꿀 뿐 새 규칙은 없다.
// 버리는 시안이라 병합하지 않는다. 설계: docs/design/259-digest-home-shell.md
import {
  applyFilters, defaultFilters, displayBestAmount, latestCaptured,
} from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

// couponModel.js conditionTable의 min 줄과 같은 글자. 그 모듈이 상수로 내보내지 않아 한 번 적고, data.test.js가 대조한다.
export const MIN_UNKNOWN = '최소주문 미확인'

export const SELECTIONS = ['today', 'top', 'fresh']

const won = (n) => `${n.toLocaleString('ko-KR')}원`

/** 최소주문 글자. 모르면(null) 칸을 비우지 않고 정식 라벨을 쓴다. 0이면 minLabel의 "최소주문 없음". */
export function minText(minOrderAmount) {
  const label = minLabel(minOrderAmount)
  if (label === null) return MIN_UNKNOWN
  return minOrderAmount === 0 ? label : `최소주문 ${label}원`
}

const bestOf = (offers) => displayBestAmount(offers)

// 금액이 같은 오퍼 중 첫째(품절 아님). 금액이 없으면(전부 불확정) 품절 아닌 첫 오퍼, 그래도 없으면 첫 오퍼.
function pickOffer(offers) {
  const best = bestOf(offers)
  if (best != null) return offers.find((o) => bestOf([o]) === best)
  return offers.find((o) => !o.soldOut) ?? offers[0]
}

function amountLabel(offers, offer) {
  const best = bestOf(offers)
  return best != null ? won(best) : amountText(offer)
}

function chipTexts(offer) {
  return headOrder(chipsOf(offer).filter(onCard)).map((c) => ({ kind: c.kind, text: c.text }))
}

function cellOf(brand, platform) {
  const offers = brand.offers.filter((o) => o.platform === platform.key)
  // 그 앱에 오퍼가 없을 때만 "-". 값을 모르는 것(금액 글자, 최소주문 미확인)과 섞지 않는다.
  if (offers.length === 0) return { platform: platform.key, label: platform.label, amountText: null, href: null, soldOut: false }
  const offer = pickOffer(offers)
  return {
    platform: platform.key,
    label: platform.label,
    amountText: amountLabel(offers, offer),
    href: offerLink(offer, brand.links, brand.name),
    soldOut: !!offer.soldOut,
    offer,
  }
}

function cardOf(brand) {
  const offer = pickOffer(brand.offers)
  return {
    name: brand.name,
    best: {
      amountText: amountLabel(brand.offers, offer),
      platform: offer.platform,
      platformLabel: PLATFORMS.find((p) => p.key === offer.platform)?.label ?? offer.platform,
      chips: chipTexts(offer),
      minText: minText(offer.minOrderAmount),
      href: offerLink(offer, brand.links, brand.name),
      soldOut: !!offer.soldOut,
      offer,
    },
    cells: PLATFORMS.map((p) => cellOf(brand, p)),
    brand,
  }
}

/**
 * 화면용 모양. selection: null | 'today' | 'top' | 'fresh'.
 * 칸 숫자와 눌러서 나오는 목록은 같은 applyFilters 결과에서 센다.
 */
export function digestOf(brands, selection = null) {
  const list = Array.isArray(brands) ? brands : []
  const today = applyFilters(list, defaultFilters())
  const fresh = applyFilters(list, { ...defaultFilters(), updatedOnly: true })
  // 오늘 할인 목록 전체 오퍼에서 브랜드별 displayBestAmount의 최댓값을 모은다(규칙이 아니라 모으기).
  const amounts = today.map((b) => bestOf(b.offers)).filter((v) => v != null)
  const topAmount = amounts.length === 0 ? null : Math.max(...amounts)

  let shown = today
  if (selection === 'fresh') shown = fresh
  const cards = shown.map(cardOf)
  if (selection === 'top') {
    // 금액 순 맨 위부터. 안정 정렬이라 같은 금액은 기본 목록 순서를 지킨다.
    const val = (c) => bestOf(c.brand.offers) ?? -1
    cards.sort((a, b) => val(b) - val(a))
    if (cards.length > 0 && topAmount != null) cards[0] = { ...cards[0], highlight: true }
  }
  return {
    capturedAt: latestCaptured(list.flatMap((b) => b.offers ?? [])),
    tiles: {
      today: { count: today.length },
      top: { amount: topAmount },
      fresh: { count: fresh.length },
    },
    cards,
  }
}
