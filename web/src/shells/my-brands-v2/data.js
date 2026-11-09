// 시안 my-brands-v2(#291)의 얇은 어댑터. 기존 모듈 값을 껍데기용 모양으로 옮기기만 한다.
// 정렬, 최고 판정, 금액 비교는 여기서 하지 않는다(filters.js, couponModel.js가 한다).
import { fetchBanners, fetchBrands } from '../../api.js'
import {
  applyFilters, defaultFilters, includesFrom, isBundle,
} from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { OWN, OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'

export const STARS_KEY = 'dk_v2_stars'
export const MIN_UNKNOWN = '최소주문 미확인' // couponModel.conditionTable이 내는 정식 라벨과 같다
const NONE = '-' // 값이 없을 때 새 문구를 만들지 않는다

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
    platform: offer.platform,
    via: offer.via ?? null,
    amount: offer.amount ?? null,
    amountLabel: amountLabel(offer),
    chips,
    minLabel: minText(offer.minOrderAmount),
    appLabel: appLabel(offer),
    href: offerLink(offer, brand.links, brand.name) ?? null,
  }
}

/** 조건(filters)으로 거른 정렬 순서 그대로의 카드. */
export function cardsFor(brands, filters) {
  const include = includesFrom(filters)
  return applyFilters(brands, filters).map((b) => cardOf(b, include)).filter(Boolean)
}

/** 기본 필터(+ 고른 분류)로 거른 카드. */
export function buildCards(brands, selectedCategories = []) {
  return cardsFor(brands, { ...defaultFilters(), categories: new Set(selectedCategories) })
}

/** 별 켜진 카드를 위로. 두 묶음 안의 순서는 원래대로. 이 시안에서 새로 하는 유일한 판단. */
export function splitStars(cards, stars) {
  return [...cards.filter((c) => stars.has(c.name)), ...cards.filter((c) => !stars.has(c.name))]
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
