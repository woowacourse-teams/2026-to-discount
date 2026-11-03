// 토스 시안 어댑터. 계산 없이 기존 모듈을 불러 껍데기용 모양으로 옮긴다(docs/design/292).
import { fetchBanners, fetchBrands } from '../../api.js'
import { applyFilters, defaultFilters, displayBestAmount, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORM_BY_KEY } from '../../platforms.js'

const APPS = ['baemin', 'coupangeats', 'ddangyo', 'yogiyo']

function toRow(brand) {
  const rep = splitOffers(brand.offers).best[0]
  const amount = displayBestAmount(brand.offers)
  const text = amountText(rep)
  const perApp = {}
  for (const key of APPS) {
    const o = brand.offers.find((x) => x.platform === key)
    perApp[key] = o ? (minLabel(o.minOrderAmount) ?? '최소주문 미확인') : '-'
  }
  return {
    name: brand.name,
    amount,
    // 금액이면 "n원 할인", 원문(1+1 등)이면 그대로
    amountText: amount != null && /원$/.test(text) ? `${text} 할인` : text,
    platform: rep.platform,
    platformLabel: PLATFORM_BY_KEY[rep.platform]?.label ?? rep.platform,
    minText: minLabel(rep.minOrderAmount) ?? '최소주문 미확인',
    chips: chipsOf(rep).filter(onCard).map((c) => c.text),
    href: offerLink(rep, brand.links, brand.name),
    capturedAt: latestCaptured(brand.offers),
    perApp,
  }
}

/** { rows, capturedAt } 를 돌려준다. SSR 데이터가 있으면 다시 받지 않는다. */
export async function loadHome(initial) {
  let brands = initial?.brands
  if (!brands) {
    const [b, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
    setHubLinks(banners)
    brands = b
  }
  const shown = applyFilters(brands, defaultFilters())
  return {
    rows: shown.map(toRow),
    capturedAt: latestCaptured(shown.flatMap((b) => b.offers)),
  }
}

// 표시 변환(계산 아님): 한국 시각 "오늘 14:30 기준" / "M월 D일 14:30 기준"
export function capturedLabel(iso, now = new Date()) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const fmt = (o) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', ...o }).format(d)
  const day = (x) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(x)
  const time = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
  if (day(d) === day(now)) return `오늘 ${time} 기준`
  return `${fmt({ month: 'numeric', day: 'numeric' })} ${time} 기준`
}
