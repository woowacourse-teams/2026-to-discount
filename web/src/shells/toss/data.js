// 토스 시안 어댑터. 계산 없이 기존 모듈을 불러 껍데기용 모양으로 옮긴다(docs/design/292).
import { fetchBanners, fetchBrands } from '../../api.js'
import { applyFilters, displayBestAmount } from '../../filters.js'
import { amountText, chipsOf, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'

function toRow(brand) {
  const rep = splitOffers(brand.offers).best[0]
  const amount = displayBestAmount(brand.offers)
  const text = amountText(rep)
  return {
    name: brand.name,
    amount,
    // 금액이면 "n원 할인", 원문(1+1 등)이면 그대로
    amountText: amount != null && /원$/.test(text) ? `${text} 할인` : text,
    platform: rep.platform,
    minText: minLabel(rep.minOrderAmount) ?? '최소주문 미확인',
    chips: chipsOf(rep).filter(onCard).map((c) => c.text),
    href: offerLink(rep, brand.links, brand.name),
  }
}

/** 브랜드 목록을 받는다. SSR 데이터가 있으면 다시 받지 않는다. */
export async function loadBrands(initial) {
  if (initial?.brands) return initial.brands
  const [b, banners] = await Promise.all([fetchBrands(), fetchBanners().catch(() => [])])
  setHubLinks(banners)
  return b
}

/** 조건(filters)을 걸러 줄 모양으로 옮긴다. */
export function toRows(brands, filters) {
  return applyFilters(brands, filters).map(toRow)
}
