// first-3s 시안의 어댑터. 기존 모듈을 불러 껍데기용 모양으로 바꾸기만 한다(docs/design/274).
// 비교, 정렬, 금액 계산을 여기서 새로 하지 않는다. 순서와 최고 오퍼는 filters.js, couponModel.js가 정한다.
import { applyFilters, defaultFilters, includesFrom, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, conditionTable, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

// 기존 정식 라벨(couponModel.conditionTable의 min과 같은 말). 새 문구가 아니다.
export const MIN_UNKNOWN = '최소주문 미확인'

/** 최소주문 칸. 모르면(null) 기존 라벨, 0은 minLabel이 "최소주문 없음"으로 가른다. */
export function minInfo(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return { kind: 'unknown', label: MIN_UNKNOWN }
  return { kind: 'value', label: offer.minOrderAmount === 0 ? label : `${label}원↑` }
}

/**
 * 오퍼 하나를 화면용으로. offer가 없으면 그 앱에 오퍼가 없다는 뜻(`none`).
 * 금액을 모르면 amountText 원문, 그것도 비면 기존 표의 '금액 ?'. 칸을 비우지 않는다.
 */
export function offerView(offer, brand) {
  if (!offer) return { kind: 'none' }
  const text = amountText(offer)
  return {
    kind: 'value',
    amount: text || '금액 ?',
    amountKnown: offer.amount != null,
    platform: offer.platform,
    platformLabel: PLATFORM_BY_KEY[offer.platform]?.label ?? offer.platform,
    chips: headOrder(chipsOf(offer).filter(onCard)),
    min: minInfo(offer),
    note: conditionTable(offer).note,
    href: offerLink(offer, brand.links, brand.name) ?? null,
    capturedAt: offer.capturedAt ?? latestCaptured(brand.offers ?? []) ?? null,
    soldOut: !!offer.soldOut,
  }
}

/** 브랜드 한 장. hasBest가 거짓이면 main은 대표일 뿐 "최고"가 아니다(3-2). */
export function brandView(brand, include) {
  const { best, hasBest } = splitOffers(brand.offers, include)
  const apps = PLATFORMS.map((p) => {
    const mine = brand.offers.filter((o) => o.platform === p.key)
    return { key: p.key, label: p.label, ...offerView(mine.length ? splitOffers(mine, include).best[0] : null, brand) }
  })
  return { name: brand.name, hasBest, main: offerView(best[0], brand), apps }
}

/** 홈 전체. 순서는 applyFilters(기본 필터)가 정한다. 히어로는 그 순서에서 hasBest가 참인 첫 브랜드. */
export function buildHome(brands) {
  const filters = defaultFilters()
  const include = includesFrom(filters)
  const cards = applyFilters(brands ?? [], filters)
    .filter((b) => b.offers.length > 0)
    .map((b) => brandView(b, include))
  const heroAt = cards.findIndex((c) => c.hasBest && c.main.kind === 'value')
  const hero = heroAt < 0 ? null : cards[heroAt]
  const list = heroAt < 0 ? cards : cards.filter((_, i) => i !== heroAt)
  return { hero, list, empty: cards.length === 0 }
}

// 표시 변환만. 비교, 정렬에 쓰지 않는다. KST 고정이라 서버와 브라우저의 첫 렌더가 같다.
const kst = (t) => new Date(t + 9 * 3600e3).toISOString()
/** "MM.DD HH:mm" (한국 시각). 못 읽으면 null. */
export function capturedDate(iso) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const s = kst(t)
  return `${s.slice(5, 10).replace('-', '.')} ${s.slice(11, 16)}`
}

/** "N분 전" 꼴. 미래 값, 하루 넘게 지난 값은 날짜로 둔다. 마운트 뒤에만 쓴다. */
export function capturedAgo(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const min = Math.floor((now - t) / 60_000)
  if (min < 0 || min >= 24 * 60) return capturedDate(iso)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  return `${Math.floor(min / 60)}시간 전`
}
