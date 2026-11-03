// 큰 카드 피드 시안(#234)의 얇은 어댑터. 기존 모듈을 불러 카드용 모양으로 바꿔 담을 뿐 새 판정과 계산은 없다.
import { fetchBrands, fetchBanners } from '../../api.js'
import {
  CATEGORIES, applyFilters, defaultFilters, displayBestAmount, includesFrom, latestCaptured, isUpdated,
} from '../../filters.js'
import { amountText, chipsOf, onCard, qualifiersOf, minLabel } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

export { CATEGORIES, PLATFORMS }

const won = (n) => `${n.toLocaleString('ko-KR')}원`

/** 쿠팡이츠 허브 링크를 채운다. 실패는 삼킨다(App.jsx와 같은 순서). */
export function loadHubLinks() {
  return fetchBanners().then(setHubLinks).catch(() => {})
}

/** 대표 오퍼 하나: 최고 금액과 같은 첫 오퍼(동점이면 최소주문 낮은 쪽). 최고가 없으면 맨 앞. */
function pickOffer(offers, top) {
  if (top == null) return offers[0]
  const tied = offers.filter((o) => o.amount === top)
  const min = (o) => o.minOrderAmount ?? Infinity
  return tied.reduce((a, b) => (min(b) < min(a) ? b : a), tied[0])
}

/** 최소주문 한 줄. 값을 알면 "n원 이상", 0이면 정식 라벨, 모르면 기존 정식 라벨 "최소주문 미확인". */
function minText(offer) {
  const m = minLabel(offer.minOrderAmount)
  if (m == null) return '최소주문 미확인'
  return offer.minOrderAmount === 0 ? m : `${m}원 이상`
}

function cardOf(brand, filters) {
  const offers = brand.offers
  const top = displayBestAmount(offers, includesFrom(filters))
  const offer = pickOffer(offers, top)
  const href = offerLink(offer, brand.links, brand.name)
  return {
    key: brand.name,
    name: brand.name,
    category: brand.category,
    amount: top != null ? won(top) : amountText(offer),
    platform: offer.platform,
    appLabel: PLATFORM_BY_KEY[offer.platform]?.label ?? '',
    chips: chipsOf(offer).filter(onCard),
    qualifiers: qualifiersOf(offer),
    min: minText(offer),
    isNew: isUpdated(offer),
    capturedAt: latestCaptured(offers),
    href,
    // 앱별 금액. 그 앱에 오퍼가 없으면 '-', 있으면 기존 금액 문구.
    apps: PLATFORMS.map((p) => {
      const o = offers.find((x) => x.platform === p.key)
      return { key: p.key, label: p.label, text: o ? amountText(o) : '-' }
    }),
  }
}

export async function loadFeed() {
  return fetchBrands()
}

/** 분류(Set 또는 빈 Set)를 적용한 카드 목록. */
export function cardsFor(brands, categories = new Set()) {
  const filters = { ...defaultFilters(), categories }
  return applyFilters(brands, filters).map((b) => cardOf(b, filters))
}

/** 전체 카드 중 가장 최근 시각. 없으면 null. */
export function newestCaptured(cards) {
  const ts = cards.map((c) => c.capturedAt).filter(Boolean)
  return ts.length === 0 ? null : ts.reduce((a, b) => (a > b ? a : b))
}
