// hero-trust 시안(#258)의 어댑터. 기존 모듈을 불러 화면 모양으로 바꿀 뿐, 계산 로직은 두지 않는다.
// 시각 서식(agoText)만 이 파일이 하는 유일한 가공이다.
import { useEffect, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { amountText, chipsOf, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { CATEGORIES, applyFilters, certaintyOf, defaultFilters, displayBestAmount, includesFrom, latestCaptured } from '../../filters.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

export { CATEGORIES, PLATFORMS }

/** 기준 시각과의 차이를 글자로. 시각을 모르면 null. */
export function agoText(capturedAt, now = Date.now()) {
  if (!capturedAt) return null
  const t = new Date(capturedAt).getTime()
  if (Number.isNaN(t)) return null
  const min = Math.max(0, Math.floor((now - t) / 60000))
  if (min < 60) return `${min}분 전 갱신`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전 갱신`
  return `${Math.floor(hour / 24)}일 전 갱신`
}

function viewOf(offer, brand, filters) {
  if (!offer) return null
  const min = minLabel(offer.minOrderAmount)
  return {
    offer,
    amount: amountText(offer),
    min: min ?? '최소주문 미확인', // 모름은 비우지 않고 기존 정식 라벨(이슈 결정 2026-11-03)
    chips: chipsOf(offer).filter(onCard).map((c) => c.text),
    exact: certaintyOf(offer) === 'exact',
    href: offerLink(offer, brand.links, brand.name),
    platform: offer.platform,
  }
}

/** 브랜드 하나를 화면 모양으로. */
export function brandView(brand, filters) {
  const include = includesFrom(filters)
  const rep = viewOf(splitOffers(brand.offers, include).best[0], brand, filters)
  const captured = latestCaptured(brand.offers)
  const apps = PLATFORMS.map((p) => {
    const own = brand.offers.filter((o) => o.platform === p.key)
    const top = own.length ? viewOf(splitOffers(own, include).best[0], brand, filters) : null
    return { key: p.key, label: p.label, view: top, best: !!top && top.offer.amount != null && top.offer.amount === displayBestAmount(brand.offers, include) }
  })
  return { name: brand.name, category: brand.category, rep, captured, ago: agoText(captured), apps }
}

export function useHeroTrustData() {
  const [state, setState] = useState({ loading: true, error: false, brands: [], filters: defaultFilters() })
  useEffect(() => {
    let alive = true
    fetchBanners().catch(() => []).then((b) => setHubLinks(b)).then(() => fetchBrands())
      .then((brands) => { if (alive) setState({ loading: false, error: false, brands, filters: defaultFilters() }) })
      .catch(() => { if (alive) setState((s) => ({ ...s, loading: false, error: true })) })
    return () => { alive = false }
  }, [])
  return state
}

/** 카테고리를 거른 목록(applyFilters가 거른다). */
export function listFor(brands, filters, category) {
  const f = { ...filters, categories: new Set(category ? [category] : []) }
  return applyFilters(brands, f).map((b) => brandView(b, f))
}
