// portfolio-modern 껍데기의 얇은 어댑터. 기존 모듈을 부르고 화면용 이름으로 담기만 한다(계산 로직 금지).
import {
  CATEGORIES, applyFilters, defaultFilters, displayBestAmount, includesFrom, isBundle, latestCaptured,
} from '../../filters.js'
import {
  amountText, channelOf, chipsOf, headOrder, minLabel, onCard, splitOffers,
} from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { popularToday, STRIP_MIN } from '../../popularStrip.js'
import { brandLogoSrc } from '../../logoSrc.js'
import { PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

export const UNKNOWN_MIN = '최소주문 미확인' // couponModel.conditionTable의 min과 같은 기존 라벨
export const NONE = '-' // 그 앱에 오퍼가 없음

export { CATEGORIES }

function amountLabel(offer) {
  const text = amountText(offer)
  // 금액이 있는 일반 오퍼만 " 할인"을 붙인다. 묶음 행사와 금액 없는 원문은 그대로(열린 질문 4).
  return offer.amount != null && !isBundle(offer) && text ? `${text} 할인` : text
}

function minText(offer) {
  return minLabel(offer.minOrderAmount) ?? UNKNOWN_MIN
}

/** 앱 칸: 오퍼가 없으면 '-', 있으면 그 앱 대표 오퍼의 금액. */
function appCells(offers, include, links, name) {
  return PLATFORMS.map((p) => {
    const mine = offers.filter((o) => o.platform === p.key)
    if (mine.length === 0) return { key: p.key, label: p.label, amount: NONE, none: true }
    const o = splitOffers(mine, include).best[0]
    return { key: p.key, label: p.label, amount: amountLabel(o), min: minText(o), none: false, href: offerLink(o, links, name) }
  })
}

function cardOf(brand, include) {
  const { best } = splitOffers(brand.offers, include)
  const offer = best[0]
  if (!offer) return null
  return {
    name: brand.name,
    category: brand.category,
    logo: brandLogoSrc(brand.name),
    amount: amountLabel(offer),
    hasAmount: offer.amount != null,
    app: PLATFORM_BY_KEY[offer.platform]?.label ?? '',
    channel: channelOf(offer),
    chips: headOrder(chipsOf(offer).filter(onCard)).map((c) => ({ kind: c.kind, text: c.text })),
    min: minText(offer),
    href: offerLink(offer, brand.links, brand.name),
    apps: appCells(brand.offers, include, brand.links, brand.name),
  }
}

/**
 * brands: fetchBrands() 값. categoryKeys: 고른 카테고리 키(없으면 전체).
 * 돌려주는 모양: { cards, updatedAt, summary: { count, top, popular }, popularCount }
 */
export function buildHome(brands, categoryKeys = []) {
  const filters = { ...defaultFilters(), categories: new Set(categoryKeys) }
  const include = includesFrom(filters)
  const list = applyFilters(brands ?? [], filters)
  const cards = list.map((b) => cardOf(b, include)).filter(Boolean)

  let top = null
  for (const b of list) {
    const v = displayBestAmount(b.offers, include)
    if (v != null && (top == null || v > top.value)) top = { value: v, brand: b.name }
  }
  const popular = popularToday(brands ?? [])
  return {
    cards,
    updatedAt: latestCaptured(list.flatMap((b) => b.offers)),
    summary: {
      count: list.length,
      top: top && { amount: `${top.value.toLocaleString('ko-KR')}원 할인`, brand: top.brand },
      // 3곳 미만이면 popularToday 쪽 규칙(STRIP_MIN)대로 인기 칸을 쓰지 않는다. 앱 수로 대체.
      popular: popular.length >= STRIP_MIN && popular[0].brand ? popular[0].brand.name : null,
      appCount: PLATFORMS.length,
    },
  }
}
