// 초압축 목록 시안(#241)의 얇은 어댑터. 기존 모듈을 불러 화면용 모양으로 바꿀 뿐 판정을 새로 짜지 않는다.
// 최고 오퍼는 splitOffers(운영 카드와 같은 규칙), 금액은 amountText, 조건은 chipsOf, 링크는 offerLink가 낸다.
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { applyFilters, defaultFilters, includesFrom, latestCaptured } from '../../filters.js'
import { offerLink } from '../../offerLink.js'

const UNKNOWN_MIN = '최소주문 미확인' // 기존 정식 라벨(couponModel.conditionTable). 모르는 최소주문을 비우지 않는다(이슈 #241 결정).
const UNKNOWN_AMOUNT = '금액 미확인' // 기존 라벨(HiddenBrandsSheet)

/** 조건 칸. 자격을 가르는 조건(kind 'condition')을 맨 앞으로 올린 뒤 첫 칩. 칩이 없으면 null. */
export function conditionOf(offer) {
  const chips = headOrder(chipsOf(offer).filter(onCard))
  const sorted = [...chips.filter((c) => c.kind === 'condition'), ...chips.filter((c) => c.kind !== 'condition')]
  if (sorted.length === 0) return { text: null, more: 0, all: [] }
  return { text: sorted[0].text, more: sorted.length - 1, all: sorted.map((c) => c.text) }
}

/** 최소주문 칸 글자. 0은 "최소주문 없음", 숫자는 "10,000원↑", 모르면 "최소주문 미확인". */
export function minText(offer) {
  const m = offer.minOrderAmount
  const label = minLabel(m)
  if (label == null) return UNKNOWN_MIN
  return m === 0 ? label : `${label}원↑`
}

/** capturedAt(ISO) → "11.03 14:05" 한국 시각. 없거나 읽을 수 없으면 null(지금 시각을 대신 쓰지 않는다). */
export function capturedLabel(iso) {
  if (!iso) return null
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(t).map((p) => [p.type, p.value]),
  )
  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

/** 모든 브랜드의 모든 오퍼 중 가장 최근 확인 시각. 없으면 null. */
export function checkedAt(brands) {
  return capturedLabel(latestCaptured(brands.flatMap((b) => b.offers ?? [])))
}

/** 브랜드 하나 → 줄 하나. 동점 최고면 앱이 여럿이다. */
export function rowOf(brand, filters) {
  const { best } = splitOffers(brand.offers, includesFrom(filters))
  const lead = best[0]
  const cond = conditionOf(lead)
  const amount = amountText(lead)
  return {
    key: brand.name,
    name: brand.name,
    amount: amount || UNKNOWN_AMOUNT,
    soldOut: !!lead.soldOut,
    condition: cond.text,
    conditionMore: cond.more,
    min: minText(lead),
    href: offerLink(lead, brand.links, brand.name),
    apps: best.map((o) => ({ key: o.platform, platform: o.platform, href: offerLink(o, brand.links, brand.name) })),
    label: [brand.name, amount || UNKNOWN_AMOUNT, ...cond.all, minText(lead)].join(', '),
  }
}

/** 화면 한 장분: 줄들과 분류 띠에 쓰는 필터. 기본 필터에 분류만 얹는다. */
export function buildRows(brands, category = null) {
  const filters = defaultFilters()
  if (category) filters.categories = new Set([category])
  return applyFilters(brands, filters).map((b) => rowOf(b, filters))
}
