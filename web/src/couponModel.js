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

const won = (n) => `${n.toLocaleString('ko-KR')}원`

/**
 * 펼친 쿠폰 아래 작은 표. 구간마다 한 줄 { amount, extra(정률 괄호), chips[채널, 멤버십, 조건], min, until }, 조건 문장은 note.
 * 구간이 둘 이상이거나 구간에 채널, 멤버십, 조건, 기한이 붙었을 때만 줄을 낸다(구간 하나가 쿠폰과 같으면 중복).
 * 계산식(최적)은 배지 아래에 이미 있으니 표에 넣지 않는다.
 */
export function conditionTable(offer) {
  const tiers = Array.isArray(offer.tiers) ? [...offer.tiers].sort((a, b) => b.amount - a.amount) : []
  const extra = (t) => t.channel || (t.membership && t.membership !== 'none') || t.note
    || (t.expiresAt && t.expiresAt !== offer.expiresAt)
  const rows = []
  if (tiers.length > 1 || tiers.some(extra)) {
    for (const t of tiers) {
      const min = t.minOrder ?? (t.amount === offer.amount ? offer.minOrderAmount : null)
      rows.push({
        amount: t.amount == null ? '금액 ?' : `${won(t.amount)}${t.soldOut ? ' 품절' : ''}`,
        extra: t.percent != null ? `${t.percent}%${t.cap != null && t.cap !== t.amount ? `, 최대 ${won(t.cap)}` : ''}` : '',
        chips: [t.channel, t.membership && t.membership !== 'none' ? (MEMBERSHIP_LABEL[offer.platform] ?? t.membership) : null, t.note,
          t.expiresAt && t.expiresAt !== offer.expiresAt ? `~${t.expiresAt.slice(5).replace('-', '.')}` : null].filter(Boolean),
        min: min != null ? `${won(min)}↑` : '최소주문 ?',
      })
    }
  }
  const note = offer.conditions && !formulaOf(offer) ? offer.conditions : ''
  return { rows, note }
}

/** 이름 한 줄. 상한은 CSS(clamp)가 화면 폭으로 정하고, 여기서는 글자 수만큼 깎을 px를 낸다(폭을 재지 않는다). 하한 12px는 CSS. */
export function nameCutPx(name) {
  const len = [...name].length
  return Math.round(Math.max(0, len - 8) * 0.7 * 10) / 10
}

/** 쿠폰 금액 옆 채널 칩("포장", "배달"). 금액이 같은 구간의 채널, 없으면 badge 글자에서. 모르면 null(있을 때만 그린다). */
export function channelOf(offer) {
  const tier = (offer.tiers ?? []).find((t) => t.channel && t.amount === offer.amount)
  if (tier) return tier.channel
  const m = /포장|배달/.exec(offer.badge ?? '')
  return m ? m[0] : null
}

export function amountText(offer) {
  return offer.amount != null ? `${offer.amount.toLocaleString('ko-KR')}원` : (offer.rawText ?? '')
}
