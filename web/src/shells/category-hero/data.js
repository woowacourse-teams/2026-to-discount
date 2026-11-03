// 카테고리별 오늘의 한 장 껍데기(#272)의 데이터 어댑터. 기존 모듈을 불러 화면용 모양으로 바꿀 뿐이다.
// 비교, 정렬, 확실성 판정은 filters.js, couponModel.js가 가진 한 벌만 쓴다(복제 금지).
import { fetchBanners, fetchBrands } from '../../api.js'
import {
  CATEGORIES,
  applyFilters,
  defaultFilters,
  includesFrom,
  latestCaptured,
  visibleCategories,
} from '../../filters.js'
import { amountText, chipsOf, conditionTable, minLabel, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

const CHIP_MAX = 3
export const MIN_UNKNOWN = '최소주문 미확인'
const AMOUNT_UNKNOWN = '금액 ?'

// 숫자면 '원↑'을 붙여 읽히게 한다(상세 표의 {n}원↑ 꼴). 0은 minLabel이 낸 라벨 그대로, 모르면 정식 라벨.
function minText(m) {
  const label = minLabel(m)
  if (label == null) return MIN_UNKNOWN
  return m === 0 ? label : `${label}원↑`
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})
function capturedText(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = Object.fromEntries(KST.formatToParts(d).map((x) => [x.type, x.value]))
  const hour = p.hour === '24' ? '00' : p.hour
  return `${p.month}월 ${p.day}일 ${hour}:${p.minute} 기준`
}

// 앱별 한 줄: 없음(-)과 모름(금액 ?, 최소주문 미확인)을 가른다.
function appLine(platform, offers, include) {
  const mine = offers.filter((o) => o.platform === platform.key)
  if (mine.length === 0) return { key: platform.key, label: platform.label, state: 'none', amount: '-', min: '' }
  const top = splitOffers(mine, include).best[0]
  const amount = amountText(top)
  return {
    key: platform.key,
    label: platform.label,
    state: amount ? 'value' : 'unknown',
    amount: amount || AMOUNT_UNKNOWN,
    min: minText(top.minOrderAmount),
  }
}

export function buildCards(brands) {
  const filters = defaultFilters()
  const include = includesFrom(filters)
  const byName = new Map(brands.map((b) => [b.name, b]))
  const cards = []
  for (const cat of visibleCategories(brands).filter((c) => CATEGORIES.includes(c))) {
    const brand = applyFilters(brands, { ...filters, categories: new Set([cat.key]) })[0]
    if (!brand) continue
    const split = splitOffers(brand.offers, include)
    // 확정 최고가 없으면 '오늘의 한 장'으로 세우지 않는다.
    if (!split.hasBest) continue
    const offer = split.best[0]
    const all = (byName.get(brand.name) ?? brand).offers
    cards.push({
      key: cat.key,
      label: cat.label,
      brandName: brand.name,
      brandLinks: brand.links,
      amount: amountText(offer),
      platformKey: offer.platform,
      platformLabel: PLATFORM_BY_KEY[offer.platform]?.label ?? '',
      min: minText(offer.minOrderAmount),
      chips: chipsOf(offer).filter((c) => c.scope === 'offer').slice(0, CHIP_MAX),
      note: conditionTable(offer).note,
      capturedText: capturedText(latestCaptured(brand.offers)),
      href: offerLink(offer, brand.links, brand.name),
      offer,
      apps: PLATFORMS.map((p) => appLine(p, all, include)),
    })
  }
  return cards
}

export async function loadCards() {
  const [brands, banners] = await Promise.all([
    fetchBrands(),
    fetchBanners().catch(() => []),
  ])
  setHubLinks(banners)
  return buildCards(brands)
}
