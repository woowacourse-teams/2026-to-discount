// 쿠폰 브랜드 카드(메인 화면 A안 16차)의 계산. 화면 없이 테스트한다.
// 명세: tracker docs/superpowers/specs/2026-10-03-home-a-display-model.md
import { MEMBERSHIP_LABEL, comparable, displayBestAmount } from './filters.js'

const byMinOrder = (a, b) => (a.minOrderAmount ?? Infinity) - (b.minOrderAmount ?? Infinity)
const QUALIFIER_BADGE = {
  최대: { kind: 'qualifier-plain', text: '불확정' },
  랜덤: { kind: 'qualifier-random', text: '랜덤' },
  특정메뉴: { kind: 'qualifier-plain', text: '특정메뉴' },
}

/**
 * 최고(동점이면 전부)와 나머지. 운영 카드(BrandCard)와 같은 규칙이다:
 * 견줄 수 있고 품절이 아닌 오퍼 중 가장 큰 금액, 동점은 하나를 골라 올리지 않는다.
 * 하위는 최대(불확정)를 뒤로 민 뒤 금액 큰 순. 최고가 없으면 그 순서의 맨 앞이 대표다.
 */
export function splitOffers(offers, include) {
  const top = displayBestAmount(offers, include)
  const isBest = (x) => top != null && comparable(x, include) && !x.soldOut && x.amount === top
  const sorted = [...offers].sort((a, b) => {
    const am = a.qualifier === '최대' ? 1 : 0
    const bm = b.qualifier === '최대' ? 1 : 0
    return am - bm || (b.amount ?? -1) - (a.amount ?? -1)
  })
  const best = sorted.filter(isBest).sort(byMinOrder)
  if (best.length > 0) return { best, rest: sorted.filter((x) => !isBest(x)), hasBest: true }
  return { best: sorted.slice(0, 1), rest: sorted.slice(1), hasBest: false }
}

export function minLabel(m) {
  if (m === 0) return '최소주문 없음'
  if (m == null) return '최소주문 ?'
  return m.toLocaleString('ko-KR')
}

/** 최적(쿠폰을 겹친 값)의 계산식. 식 기호가 있는 문장만 식으로 본다. */
export function formulaOf(offer) {
  if (offer.qualifier !== '최적' || !offer.conditions) return null
  return /[×+=]/.test(offer.conditions) ? offer.conditions : null
}

const RATE = /^\d+%할인$/

/**
 * 오퍼의 배지. 순서가 뜻이다: 값의 성격 → 누구만 쓰는지 → 언제까지인지(명세 4절).
 * showBestFit=false는 운영 칩(최적을 그리지 않는다), shortTime=false는 한정 배지를 원문 그대로 둔다.
 */
export function badgesOf(offer, { showBestFit = true, shortTime = true } = {}) {
  const out = []
  const badge = offer.badge ?? ''
  const q = QUALIFIER_BADGE[offer.qualifier]
  if (q) out.push(q)
  else if (showBestFit && offer.qualifier === '최적') out.push({ kind: 'best-fit', text: '최적' })
  else if (RATE.test(badge)) out.push({ kind: 'rate', text: badge })
  // 구조화된 membership이 먼저, 필드가 없는 옛 행은 badge 끝말로(운영 칩 규칙)
  if ((offer.membership && offer.membership !== 'none') || badge.endsWith('전용쿠폰')) {
    out.push({ kind: 'membership', text: MEMBERSHIP_LABEL[offer.platform] ?? badge })
  }
  if (badge && !RATE.test(badge) && !/전용|클럽|패스/.test(badge)) {
    const time = shortTime && badge.match(/^(?:오전|오후)\s*(\d+시)\s*오픈$/)
    out.push({ kind: 'limited', text: time ? time[1] : badge })
  }
  return out
}

/**
 * 복수 최고 쿠폰의 포스트잇 배지. 모든 앱의 배지가 같으면 앱 표시 없이(platform null),
 * 다르면 배지마다 그 앱을 붙여 어느 앱 것인지 밝힌다. 배지가 없으면 빈 배열.
 */
export function postitOf(offers) {
  const lists = offers.map((x) => badgesOf(x))
  const key = (l) => JSON.stringify(l)
  if (lists.every((l) => key(l) === key(lists[0]))) return lists[0].map((b) => ({ platform: null, ...b }))
  return offers.flatMap((x, i) => lists[i].map((b) => ({ platform: x.platform, ...b })))
}

/** 이름 한 줄. 그린 뒤 폭을 재지 않고 글자 수로 정한다(배치 계산을 늘리지 않으려고). */
export function nameFontPx(name) {
  const len = [...name].length
  const px = 17 - Math.max(0, len - 8) * 0.7
  return Math.max(12, Math.round(px * 10) / 10)
}

export function amountText(offer) {
  return offer.amount != null ? `${offer.amount.toLocaleString('ko-KR')}원` : (offer.rawText ?? '')
}
