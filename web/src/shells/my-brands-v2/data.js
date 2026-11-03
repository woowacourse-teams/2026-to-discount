// 시안 my-brands-v2(#291)의 얇은 어댑터. 기존 모듈 값을 껍데기용 모양으로 옮기기만 한다.
// 정렬, 최고 판정, 금액 비교는 여기서 하지 않는다(filters.js, couponModel.js가 한다).
import { fetchBanners, fetchBrands } from '../../api.js'
import {
  CATEGORIES, applyFilters, defaultFilters, includesFrom, isBundle, latestCaptured, visibleCategories,
} from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { STRIP_MIN, popularToday } from '../../popularStrip.js'
import { OWN, OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'
import { brandLogoSrc } from '../../logoSrc.js'

export const STARS_KEY = 'dk_v2_stars'
export const MIN_UNKNOWN = '최소주문 미확인' // couponModel.conditionTable이 내는 정식 라벨과 같다
const NONE = '-' // 값이 없을 때 새 문구를 만들지 않는다

export { CATEGORIES, visibleCategories }

/** "n원 할인". 묶음 행사나 금액이 없는 오퍼는 원문 그대로(할인을 붙이지 않는다). 원문도 없으면 '-'. */
export function amountLabel(offer) {
  const text = amountText(offer)
  if (!text) return NONE
  return isBundle(offer) || offer.amount == null ? text : `${text} 할인`
}

/** 최소주문 칸. 숫자는 'N원↑', 0은 '최소주문 없음', 모르면(null) '최소주문 미확인'. 비우지 않는다. */
export function minText(minOrderAmount) {
  const label = minLabel(minOrderAmount)
  if (label == null) return MIN_UNKNOWN
  return minOrderAmount === 0 ? label : `${label}원↑`
}

export function appLabel(offer) {
  if (offer.platform === OWN) return OWN_LABEL
  return PLATFORM_BY_KEY[offer.platform]?.label ?? NONE
}

/** 카드 한 장. 대표 오퍼는 splitOffers가 정한 best[0]. */
export function cardOf(brand, include) {
  const offer = splitOffers(brand.offers, include).best[0]
  if (!offer) return null
  const chips = headOrder(chipsOf(offer).filter(onCard)).map((c) => ({ kind: c.kind, text: c.text }))
  return {
    name: brand.name,
    category: brand.category,
    logoSrc: brandLogoSrc(brand.name),
    amount: offer.amount ?? null,
    amountLabel: amountLabel(offer),
    chips,
    minLabel: minText(offer.minOrderAmount),
    appLabel: appLabel(offer),
    href: offerLink(offer, brand.links, brand.name) ?? null,
    capturedAt: offer.capturedAt ?? null,
  }
}

/** 기본 필터(+ 고른 분류)로 거른 정렬 순서 그대로의 카드. */
export function buildCards(brands, selectedCategories = []) {
  const filters = { ...defaultFilters(), categories: new Set(selectedCategories) }
  const include = includesFrom(filters)
  return applyFilters(brands, filters).map((b) => cardOf(b, include)).filter(Boolean)
}

/** 별 켜진 카드를 위로. 두 묶음 안의 순서는 원래대로. 이 시안에서 새로 하는 유일한 판단. */
export function splitStars(cards, stars) {
  return [...cards.filter((c) => stars.has(c.name)), ...cards.filter((c) => !stars.has(c.name))]
}

/** 인기 띠. 분류, 검색을 뺀 기본 필터 목록 기준. STRIP_MIN 미만이면 빈 목록. */
export function popularList(brands) {
  const list = popularToday(applyFilters(brands, defaultFilters()))
  return list.length < STRIP_MIN ? [] : list.map((p) => ({ name: p.brand.name, rank: p.rank }))
}

/** 가장 최근 수집 시각(ISO 문자열) 또는 null. */
export function lastCaptured(brands) {
  return latestCaptured(brands.flatMap((b) => b.offers ?? []))
}

/** 상대 표기. 시각을 모르거나 읽을 수 없으면 null(줄을 그리지 않는다). */
export function agoLabel(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return null
  const min = Math.max(0, Math.floor((now - t) / 60000))
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  return `${Math.floor(hour / 24)}일 전`
}

export function readStars(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(STARS_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [])
  } catch { return new Set() }
}

export function writeStars(stars, storage = globalThis.localStorage) {
  try { storage?.setItem(STARS_KEY, JSON.stringify([...stars])) } catch { /* 저장 못 해도 이번 화면은 그대로 */ }
}

/** 브랜드와 배너를 받고 허브 링크를 채운다(App이 하는 일과 같다). 배너 실패는 허브 링크만 빈다. */
export async function loadHome() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return brands
}
