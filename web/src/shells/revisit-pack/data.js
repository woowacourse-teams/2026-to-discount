// 시안 revisit-pack의 얇은 어댑터. 계산은 전부 기존 모듈이 하고, 여기서는 이름을 바꾸고 모양을 묶는다.
// 병합하지 않는 시안이다(docs/design/271-revisit-pack-shell.md).
import { applyFilters, defaultFilters, displayBestAmount, isUpdated, latestCaptured } from '../../filters.js'
import { amountText, channelOf, chipsOf, headOrder, minLabel, onCard, qualifiersOf, splitOffers } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { popularToday } from '../../popularStrip.js'
import { PLATFORMS } from '../../platforms.js'

// 표시 강조에만 쓰는 시안용 상수. 판정이 아니다.
export const STALE_HOURS = 24
export const CHIP_LIMIT = 3
export const SAVED_KEY = 'dk_rp_brands'

const HOUR = 3600e3

/** 갱신 시각 문구. 값이 없으면 null(줄을 뺀다). 서식일 뿐 판정이 아니다. */
export function agoText(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const diff = Math.max(0, now - t)
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / 60e3))}분 전`
  if (diff < 24 * HOUR) return `${Math.floor(diff / HOUR)}시간 전`
  return '어제'
}

export const isStale = (iso, now = Date.now()) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) && now - t > STALE_HOURS * HOUR
}

/** 최소주문 문구. 모르면 기존 정식 라벨(칸을 비우지 않는다). */
export function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return '최소주문 미확인'
  return offer.minOrderAmount === 0 ? label : `${label}원↑`
}

/** 카드 머리 칩: 한정된 채널, 멤버십, 한정 순. 앞 CHIP_LIMIT개만 펴고 나머지는 접는다(숨기지 않는다). */
export function chipsFor(offer) {
  const all = headOrder(chipsOf(offer).filter(onCard)).map((c) => c.text)
  return { shown: all.slice(0, CHIP_LIMIT), folded: all.slice(CHIP_LIMIT) }
}

function cellOf(offer, brand) {
  return {
    offer,
    amount: amountText(offer),
    min: minText(offer),
    chips: chipsFor(offer),
    qualifiers: qualifiersOf(offer),
    channel: channelOf(offer),
    isNew: isUpdated(offer),
    href: offerLink(offer, brand.links, brand.name),
  }
}

/** 앱별 칸 네 개 고정. 그 앱에 오퍼가 없으면 offer가 null(화면에서 `-`). */
export function appCells(brand) {
  return PLATFORMS.map((p) => {
    const mine = brand.offers.filter((o) => o.platform === p.key)
    if (mine.length === 0) return { platform: p.key, label: p.label, cell: null }
    const pick = splitOffers(mine, false).best[0]
    return { platform: p.key, label: p.label, cell: cellOf(pick, brand) }
  })
}

/** 브랜드 카드 한 장의 값. 대표 금액은 displayBestAmount(4,999 천장값을 찍지 않는다). */
export function cardOf(brand) {
  const { best } = splitOffers(brand.offers, false)
  const top = displayBestAmount(brand.offers, false)
  const headOffer = (top != null && best.find((o) => o.amount === top)) || best[0] || brand.offers[0]
  const captured = latestCaptured(brand.offers)
  return {
    name: brand.name,
    brand,
    head: headOffer ? cellOf(headOffer, brand) : null,
    headAmount: top != null ? `${top.toLocaleString('ko-KR')}원` : (headOffer ? amountText(headOffer) : ''),
    apps: appCells(brand),
    captured,
  }
}

/** 전체 목록 순서는 기본 필터 그대로. */
export function listOf(brands) {
  return applyFilters(brands, defaultFilters())
}

/** 저장한 이름 중 응답에 있는 것만. 비면 popularToday 상위로 채운다. */
export function myBrands(brands, saved) {
  const byName = new Map(brands.map((b) => [b.name, b]))
  const mine = (saved ?? []).map((n) => byName.get(n)).filter(Boolean)
  if (mine.length > 0) return { filled: false, brands: mine }
  return { filled: true, brands: popularToday(brands).map((p) => p.brand).filter(Boolean) }
}

/** 새 오퍼가 있는 브랜드와 그 새 오퍼. 하나도 없으면 빈 배열. */
export function newOffers(brands) {
  const out = []
  for (const brand of brands) {
    const fresh = brand.offers.filter((o) => isUpdated(o))
    if (fresh.length === 0) continue
    const pick = splitOffers(fresh, false).best[0]
    out.push({ brand, cell: cellOf(pick, brand), captured: latestCaptured(brand.offers) })
  }
  return out
}

/** 전체 마지막 갱신 = 브랜드별 값의 최대. */
export function overallCaptured(brands) {
  return latestCaptured(brands.map((b) => ({ capturedAt: latestCaptured(b.offers) })))
}

export function readSaved(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(SAVED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

export function writeSaved(names, storage = globalThis.localStorage) {
  try { storage?.setItem(SAVED_KEY, JSON.stringify(names)) } catch { /* 저장 못 해도 이번 화면은 그대로 */ }
}
