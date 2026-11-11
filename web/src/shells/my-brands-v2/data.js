// 시안 my-brands-v2(#291)의 얇은 어댑터. 기존 모듈 값을 껍데기용 모양으로 옮기기만 한다.
// 정렬, 최고 판정, 금액 비교는 여기서 하지 않는다(filters.js, couponModel.js가 한다).
import {
  applyFilters, defaultFilters, includesFrom, isBundle, isUpdated,
} from '../../filters.js'
import { amountText, beforeOpen, chipsOf, conditionTable, headOrder, minLabel, onCard, shortBrandName, splitOffers } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { OWN, OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'

export const MIN_UNKNOWN = '최소주문 미확인' // couponModel.conditionTable이 내는 정식 라벨과 같다
const NONE = '-' // 값이 없을 때 새 문구를 만들지 않는다

/** "n원 할인". 묶음 행사나 금액이 없는 오퍼는 원문 그대로(할인을 붙이지 않는다). 원문도 없으면 '-'. */
export function amountLabel(offer) {
  const text = amountText(offer)
  if (!text) return NONE
  return isBundle(offer) || offer.amount == null ? text : `${text} 할인`
}

/** "12,000원 할인"을 숫자와 나머지로 가른다. 이 꼴이 아니면(묶음 행사 원문 등) null. */
export function splitAmount(label) {
  const m = /^([\d,.]+)((?:원|%) 할인)$/.exec(label)
  return m ? { num: m[1], rest: m[2] } : null
}

/** "30,000원 이상 주문시"를 금액 부분과 나머지로 가른다. 이 꼴이 아니면(최소주문 없음, 미확인) null. */
export function splitMin(label) {
  const m = /^(.+원 이상)( 주문시)$/.exec(label)
  return m ? { amt: m[1], rest: m[2] } : null
}

/** 최소주문 칸. 숫자는 'N원 이상 주문시', 0은 '최소주문 없음', 모르면(null) '최소주문 미확인'. 비우지 않는다. */
export function minText(minOrderAmount) {
  const label = minLabel(minOrderAmount)
  if (label == null) return MIN_UNKNOWN
  return minOrderAmount === 0 ? label : `${label}원 이상 주문시`
}

export function appLabel(offer) {
  if (offer.platform === OWN) return OWN_LABEL
  return PLATFORM_BY_KEY[offer.platform]?.label ?? NONE
}

/** 카드 한 장. 대표 오퍼는 splitOffers가 정한 best[0]. */
export function cardOf(brand, include) {
  const { best, hasBest, bundles } = splitOffers(brand.offers, include)
  const offer = best[0]
  if (!offer) return null
  const chips = headOrder(chipsOf(offer, brand.name).filter(onCard)).map((c) => ({ kind: c.kind, text: c.text, platform: c.platform ?? offer.platform }))
  return {
    name: brand.name,
    displayName: shortBrandName(brand),
    category: brand.category,
    brand,
    offer,
    // 비교할 수 있는 최고 할인이 있는 브랜드인가(운영 카드의 hasBest). 클릭 기록의 best 값과 숨기기 기준 금액이 쓴다.
    hasBest,
    // 1+1 같은 묶음 행사: 운영 카드처럼 카드 맨 위 한 줄로 따로 선다(대표 금액 비교 밖). 묶음뿐인 브랜드는 그것이 대표라 여기엔 없다.
    bundles: bundles.map((o) => ({ offer: o, label: o.rawText })),
    platform: offer.platform,
    via: offer.via ?? null,
    amount: offer.amount ?? null,
    amountLabel: amountLabel(offer),
    chips,
    // 신규 오퍼가 하나라도 있는 브랜드(운영 카드 왼쪽 위 NEW! 리본과 같은 조건: CouponCard.jsx brand.offers.some(isUpdated))
    isNew: brand.offers.some((o) => isUpdated(o)),
    minLabel: minText(offer.minOrderAmount),
    // 품절, 오픈 전은 카드 몸통에 내고 금액 채도를 뺀다(CouponCard.jsx stateLabel과 같은 말)
    state: offer.soldOut ? '품절' : beforeOpen(offer) ? '오픈 전' : null,
    appLabel: appLabel(offer),
    href: offerLink(offer, brand.links, brand.name) ?? null,
  }
}

/** 자세히 보기: 대표와 나머지 오퍼 전부. 줄마다 앱, 금액, 최소주문, 배지, 구간표(conditionTable), 링크. */
export function detailOf(brand, include) {
  const { best, rest, bundles } = splitOffers(brand.offers, include)
  return [...best, ...rest].map((o, i) => {
    const { rows, note } = conditionTable(o)
    return {
      offer: o, // 링크와 클릭 기록이 운영과 같은 입력을 쓰도록 원본 오퍼를 같이 준다
      best: i < best.length,
      // 운영 시트는 [...묶음, ...최고, ...나머지]의 순번을 slot으로 기록한다. 이 시안 시트는 묶음 행사를 안 그리지만 순번은 운영과 같게 센다.
      slotBase: bundles.length,
      platform: o.platform,
      via: o.via ?? null,
      appLabel: appLabel(o),
      amountLabel: amountLabel(o),
      minLabel: minText(o.minOrderAmount),
      chips: chipsOf(o, brand.name).filter((c) => c.scope === 'offer').map((c) => ({ kind: c.kind, text: c.text, platform: c.platform ?? o.platform })),
      // 합산식(10,000+2,000)은 화면에 안 낸다. 결과 금액과 최소주문만 다른 쿠폰과 같게 보인다. 값과 속성(최적 등)은 그대로.
      rows: rows.map((r) => ({ ...r, extra: /^[\d,]+\+[\d,]+$/.test(r.extra) ? '' : r.extra, min: r.min.replace('원↑', '원 이상 주문시') })),
      note,
      href: offerLink(o, brand.links, brand.name) ?? null,
    }
  })
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

/** 뾰족한 꺾은선 경로. 이웃한 점을 직선(L)으로 잇고, 값이 없는 날(y가 null)에서 끊는다. 곡선(C)은 쓰지 않는다. */
export function polyPaths(xy, bottom) {
  const solid = []
  const area = []
  let run = null
  const close = () => {
    if (!run) return
    const line = run.d.join(' ')
    solid.push(line)
    area.push(`${line} V${bottom} H${run.x0} Z`)
    run = null
  }
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1]
    const b = xy[i]
    if (a.y == null || b.y == null) { close(); continue }
    if (!run) run = { x0: a.x, d: [`M${a.x} ${a.y}`] }
    run.d.push(`L${b.x} ${b.y}`)
  }
  close()
  return { solid, area }
}
