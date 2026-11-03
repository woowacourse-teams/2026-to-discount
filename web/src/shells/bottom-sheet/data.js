// 아래 시트 시안의 얇은 어댑터(#237). 기존 모듈이 내는 값을 화면용 모양으로 옮기기만 한다.
// 금액, 확실성, 정렬 판정을 여기서 새로 짜지 않는다. 판정이 필요하면 기존 모듈 함수를 부른다.
import { fetchBanners, fetchBrands } from '../../api.js'
import { amountText, channelOf, chipsOf, headOrder, minLabel, onCard } from '../../couponModel.js'
import {
  CATEGORIES,
  SORT_KEYS,
  applyFilters,
  defaultFilters,
  displayBestAmount,
  includesFrom,
  latestCaptured,
  visibleCategories,
} from '../../filters.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'
import { popularToday } from '../../popularStrip.js'

export { CATEGORIES, SORT_KEYS, defaultFilters, visibleCategories }

// 기존 정식 라벨(couponModel.js conditionTable의 min 칸)과 같은 글자. 최소주문을 모를 때 칸을 비우지 않는다.
const MIN_UNKNOWN = '최소주문 미확인'

/** 브랜드와 배너를 받는다. 배너는 허브 링크용이라 실패해도 브랜드는 그린다. */
export async function load() {
  const [brands, banners] = await Promise.all([
    fetchBrands(),
    fetchBanners().catch(() => []),
  ])
  setHubLinks(banners)
  return brands
}

export const platformLabel = (key) => PLATFORMS.find((p) => p.key === key)?.label ?? key

/** n분 전 꼴. 시각이 없으면 null(지어내지 않는다). */
export function agoText(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const min = Math.max(0, Math.floor((now - t) / 60000))
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`
  return `${Math.floor(min / 60 / 24)}일 전`
}

function offerView(offer, brand) {
  return {
    key: `${offer.platform}:${offer.amount}:${offer.minOrderAmount}:${offer.firstCome ? 'f' : ''}:${offer.qualifier ?? ''}`,
    platform: offer.platform,
    platformLabel: platformLabel(offer.platform),
    amount: amountText(offer),
    soldOut: !!offer.soldOut,
    // CouponCard의 Min과 같은 말: 0이면 '최소주문 없음', 양수면 '최소주문 n원', 모르면 정식 라벨
    min: offer.minOrderAmount > 0 ? `최소주문 ${minLabel(offer.minOrderAmount)}원` : (minLabel(offer.minOrderAmount) ?? MIN_UNKNOWN),
    minKnown: offer.minOrderAmount != null,
    channel: channelOf(offer),
    chips: headOrder(chipsOf(offer).filter(onCard)).filter((c) => c.kind !== 'channel'),
    capturedAt: offer.capturedAt ?? null,
    href: offerLink(offer, brand.links, brand.name),
  }
}

/** 카드 한 장의 화면 모양. 대표 오퍼는 displayBestAmount가 가리키는 금액과 같은 오퍼. */
export function cardView(brand, filters) {
  const best = displayBestAmount(brand.offers, includesFrom(filters))
  const rep = brand.offers.find((o) => best != null && o.amount === best && !o.soldOut) ?? brand.offers[0]
  const others = brand.offers.filter((o) => o !== rep)
  return {
    name: brand.name,
    brand,
    bestAmount: best,
    rep: offerView(rep, brand),
    others: others.map((o) => offerView(o, brand)),
    captured: latestCaptured(brand.offers),
    // 앱별 한 칸: 오퍼가 없으면 null(화면은 '-'), 있으면 금액 글자
    byPlatform: PLATFORMS.map((p) => {
      const o = brand.offers.find((x) => x.platform === p.key)
      return { key: p.key, label: p.label, offer: o ? offerView(o, brand) : null }
    }),
  }
}

/** 화면 전체 모양: 필터 적용 목록, 오늘 요약. */
export function homeView(brands, filters) {
  const visible = applyFilters(brands, filters)
  const hot = popularToday(brands)[0] ?? null
  const hotBest = hot?.brand ? displayBestAmount(hot.brand.offers, includesFrom(filters)) : null
  return {
    cards: visible.map((b) => cardView(b, filters)),
    count: visible.length,
    hot: hot?.brand ? { name: hot.brand.name, amount: hotBest } : null,
    captured: latestCaptured(brands.flatMap((b) => b.offers)),
  }
}
