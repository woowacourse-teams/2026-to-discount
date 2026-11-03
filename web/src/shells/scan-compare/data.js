// scan-compare 시안의 얇은 어댑터(#281). 기존 모듈을 불러 화면용 모양으로 옮길 뿐, 판정 규칙을 새로 쓰지 않는다.
// 최고, 견줄 수 있음, 정렬은 filters.js와 couponModel.js가 맡는다(1번 묶음).
import { applyFilters, defaultFilters, displayBestAmount, comparable, latestCaptured } from '../../filters.js'
import { splitOffers, amountText, chipsOf, onCard, minLabel } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS, PLATFORM_BY_KEY, OWN, OWN_LABEL } from '../../platforms.js'

// couponModel.js conditionTable이 내는 기존 정식 라벨과 같은 문자열. data.test.js가 맞댄다.
export const MIN_UNKNOWN = '최소주문 미확인'

export function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return MIN_UNKNOWN
  return offer.minOrderAmount === 0 ? label : `${label}원↑`
}

export function platformLabel(key) {
  return PLATFORM_BY_KEY[key]?.label ?? (key === OWN ? OWN_LABEL : key)
}

/** 서식 함수(판정 아님): "방금", "N분 전", "N시간 전", "N일 전". 못 읽으면 빈 문자열. */
export function ago(capturedAt, now = Date.now()) {
  if (!capturedAt) return ''
  const t = Date.parse(capturedAt)
  if (Number.isNaN(t)) return ''
  const sec = Math.floor((now - t) / 1000)
  if (sec < 60) return '방금'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  return `${Math.floor(hour / 24)}일 전`
}

function cellOf(brand, platform, bestAmount) {
  const mine = brand.offers.filter((o) => o.platform === platform.key)
  if (mine.length === 0) return { platform: platform.key, label: platform.label, state: 'none', offer: null, href: null, amount: '', min: '', chips: [], isBest: false }
  const offer = splitOffers(mine).best[0]
  return {
    platform: platform.key,
    label: platform.label,
    state: 'offer',
    offer,
    href: offerLink(offer, brand.links, brand.name),
    amount: amountText(offer),
    min: minText(offer),
    chips: chipsOf(offer).filter(onCard).map((c) => c.text),
    isBest: bestAmount != null && offer.amount === bestAmount && comparable(offer),
  }
}

export function toRows(brands) {
  return applyFilters(brands, defaultFilters()).map((brand) => {
    const bestAmount = displayBestAmount(brand.offers)
    const bestOffer = splitOffers(brand.offers).best[0]
    return {
      name: brand.name,
      category: brand.category,
      links: brand.links,
      bestAmount,
      bestOffer,
      bestAmountText: bestAmount != null ? `${bestAmount.toLocaleString('ko-KR')}원` : amountText(bestOffer),
      bestPlatformLabel: platformLabel(bestOffer.platform),
      bestMin: minText(bestOffer),
      bestChips: chipsOf(bestOffer).filter(onCard).map((c) => c.text),
      bestHref: offerLink(bestOffer, brand.links, brand.name),
      capturedAt: latestCaptured(brand.offers),
      cells: PLATFORMS.map((p) => cellOf(brand, p, bestAmount)),
    }
  })
}
