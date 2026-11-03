// 신뢰성 시안(#273)의 얇은 어댑터. 기존 모듈의 결과를 화면용 모양으로 옮겨 담을 뿐 계산하지 않는다.
// 시안 전용이라 병합하지 않는다. 기존 로직 파일(api, filters, couponModel, offerLink, popularStrip)은 고치지 않는다.
import { fetchBanners, fetchBrands } from '../../api.js'
import { applyFilters, defaultFilters, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, minLabel, onCard, shortBrandName, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { popularToday, STRIP_MIN } from '../../popularStrip.js'
import { PLATFORMS } from '../../platforms.js'

export { STRIP_MIN }

// ?state= 허용 목록. 밖의 값은 없는 것으로 친다.
export const STATES = ['stale', 'empty', 'error']

export function stateOf(search) {
  const v = new URLSearchParams(search ?? '').get('state')
  return STATES.includes(v) ? v : null
}

/** 홈과 같은 길로 데이터를 읽는다. 시안 상태(empty, error)는 네트워크를 부르지 않고 만든다. */
export async function loadHome(forced = null) {
  if (forced === 'error') throw new Error('시안: 오류 화면')
  if (forced === 'empty') return { brands: [], banners: [] }
  const [brands, banners] = await Promise.all([
    fetchBrands(),
    fetchBanners().catch(() => []), // 배너 실패는 삼킨다(App.jsx와 같은 규칙)
  ])
  setHubLinks(banners) // 쿠팡이츠 허브 링크는 배너에서 채운다
  return { brands, banners }
}

/** 최소주문 글자. 없음(0)과 모름(null)을 다르게 그린다. 모르면 기존 정식 라벨. */
export function minTextOf(offer) {
  const m = offer?.minOrderAmount
  if (m == null) return '최소주문 미확인'
  if (m === 0) return minLabel(0)
  return `최소주문 ${minLabel(m)}원`
}

/** 앱 한 칸. 그 앱에 오퍼가 없으면 '-', 있으면 그 앱의 대표 금액. */
function appCell(brand, platform) {
  const offers = brand.offers.filter((o) => o.platform === platform.key)
  if (offers.length === 0) return { platform: platform.key, label: platform.label, text: '-', none: true }
  const rep = splitOffers(offers, null).best[0]
  return { platform: platform.key, label: platform.label, text: amountText(rep), none: false }
}

/** 브랜드 하나를 카드 모양으로. 값은 전부 기존 함수의 결과다. */
export function cardOf(brand) {
  const { best, hasBest } = splitOffers(brand.offers, null)
  const rep = best[0]
  const platform = PLATFORMS.find((p) => p.key === rep.platform)
  return {
    name: brand.name,
    shortName: shortBrandName(brand),
    amount: amountText(rep),
    hasBest,
    platform: rep.platform,
    platformLabel: platform?.label ?? rep.platform,
    chips: chipsOf(rep).filter(onCard).map((c) => c.text),
    min: minTextOf(rep),
    href: offerLink(rep, brand.links, brand.name),
    updatedAt: latestCaptured(brand.offers),
    apps: PLATFORMS.map((p) => appCell(brand, p)),
  }
}

/** 홈과 같은 기본 필터와 정렬로 세운 카드 목록. */
export function cardsOf(brands) {
  return applyFilters(brands ?? [], defaultFilters()).map(cardOf)
}

/** 브랜드 전체의 마지막 갱신 시각 = 브랜드별 latestCaptured의 최댓값(같은 문자열 비교). 하나도 없으면 null. */
export function updatedAtOf(brands) {
  const ts = (brands ?? []).map((b) => latestCaptured(b.offers)).filter(Boolean)
  return ts.length === 0 ? null : ts.reduce((a, b) => (a > b ? a : b))
}

/** 오늘 인기. STRIP_MIN곳이 안 되면 빈 배열(그리지 않는다). */
export function popularOf(brands) {
  const list = popularToday(brands)
  if (list.length < STRIP_MIN) return []
  return list.map(({ brand, rank }) => ({ rank, name: brand.name, shortName: shortBrandName(brand) }))
}

// 값이 없는 화면(비었음, 오류)에서 앱을 여는 길. offerLink 사다리의 끝(앱 열기)을 쓴다.
// 요기요는 앱 열기 끝 단계가 없고 브랜드 검색 딥링크만 있어(브랜드명이 필요) 뺀다.
const OPEN_PLATFORMS = ['baemin', 'coupangeats', 'ddangyo']

export function openAppsOf() {
  return PLATFORMS.filter((p) => OPEN_PLATFORMS.includes(p.key))
    .map((p) => ({ platform: p.key, label: p.label, href: offerLink({ platform: p.key }, undefined, undefined) }))
}
