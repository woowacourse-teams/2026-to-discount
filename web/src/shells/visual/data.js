// 홈 리뉴얼 시안(visual)의 얇은 어댑터. 기존 모듈이 낸 값을 껍데기용 모양으로 옮기기만 한다.
// 정렬, 필터, 최고 금액, 칩, 링크를 여기서 새로 계산하지 않는다. 병합하지 않는 시안이다(#294).
import { fetchBanners, fetchBrands } from '../../api.js'
import { applyFilters, defaultFilters, includesFrom, isBundle, latestCaptured, CATEGORIES } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { OWN, OWN_LABEL, PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

const UNKNOWN_AMOUNT = '금액 ?' // conditionTable이 이미 쓰는 라벨
const UNKNOWN_MIN = '최소주문 미확인' // conditionTable이 이미 쓰는 라벨

export async function loadHome() {
  const [brands, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  return { brands, banners }
}

// 사진 자리. 나중에 실제 이미지가 생기면 { src }를 돌려주게 바꾼다.
const LOOKS = {
  chicken: { gradient: 'linear-gradient(135deg, #ffb347, #ff6a3d)', emoji: '🍗' },
  pizza: { gradient: 'linear-gradient(135deg, #ff8a80, #d84343)', emoji: '🍕' },
  fastfood: { gradient: 'linear-gradient(135deg, #ffd54f, #ef8a17)', emoji: '🍔' },
  cafe: { gradient: 'linear-gradient(135deg, #c9a27e, #7a5236)', emoji: '☕' },
  korean: { gradient: 'linear-gradient(135deg, #9ccc65, #4a8f3c)', emoji: '🍱' },
  japanese: { gradient: 'linear-gradient(135deg, #81d4fa, #3a7fc4)', emoji: '🍣' },
  convenience: { gradient: 'linear-gradient(135deg, #b39ddb, #5c58b8)', emoji: '🛒' },
}
const FALLBACK_LOOK = { gradient: 'linear-gradient(135deg, #cfd8dc, #78909c)', emoji: '🍽️' }

export function imageFor(brand) {
  return LOOKS[brand?.category] ?? FALLBACK_LOOK
}

export function categoryLabel(key) {
  return CATEGORIES.find((c) => c.key === key)?.label ?? ''
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
// 시안용 임시 문구: "M.D HH:mm 기준". 시각을 못 읽으면 null(줄을 그리지 않는다).
export function stampLabel(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(KST.formatToParts(d).map((x) => [x.type, x.value]))
  return `${Number(p.month)}.${Number(p.day)} ${p.hour}:${p.minute} 기준`
}

function amountLabel(best) {
  if (isBundle(best)) return amountText(best) || UNKNOWN_AMOUNT
  if (best.amount != null) return `${amountText(best)} 할인`
  return amountText(best) || UNKNOWN_AMOUNT
}

function minText(best) {
  const m = minLabel(best.minOrderAmount)
  if (m == null) return UNKNOWN_MIN
  return best.minOrderAmount === 0 ? m : `${m}원↑`
}

function appsOf(offers, include) {
  return PLATFORMS.map((p) => {
    const mine = offers.filter((o) => o.platform === p.key)
    if (mine.length === 0) return { key: p.key, label: p.label, text: '-' }
    const top = splitOffers(mine, include).best[0]
    return { key: p.key, label: p.label, text: amountText(top) || UNKNOWN_AMOUNT }
  })
}

export function homeCards(brands) {
  const filters = defaultFilters()
  const include = includesFrom(filters)
  return applyFilters(brands, filters).map((brand) => {
    const best = splitOffers(brand.offers, include).best[0]
    if (!best) return null
    return {
      brand,
      category: brand.category,
      categoryLabel: categoryLabel(brand.category),
      best,
      amountLabel: amountLabel(best),
      minLabel: minText(best),
      chips: headOrder(chipsOf(best).filter(onCard)),
      href: offerLink(best, brand.links, brand.name) || null,
      platformLabel: best.platform === OWN ? OWN_LABEL : (PLATFORM_BY_KEY[best.platform]?.label ?? ''),
      apps: appsOf(brand.offers, include),
      capturedAt: latestCaptured(brand.offers),
    }
  }).filter(Boolean)
}

export function topCards(cards) {
  return cards.slice(0, 3)
}
