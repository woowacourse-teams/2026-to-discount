// 홈 리뉴얼 시안(stories)의 얇은 어댑터(#256). 기존 모듈 결과를 껍데기용 모양으로 옮겨 담기만 한다.
// 고르기, 정렬, 금액 문구, 칩, 링크 계산은 전부 기존 모듈이 한다. 여기에 계산 로직을 늘리지 않는다.
import { fetchBanners, fetchBrands } from '../../api.js'
import { applyFilters, defaultFilters, displayBestAmount, includesFrom, latestCaptured } from '../../filters.js'
import { amountText, chipsOf, headOrder, minLabel, onCard, splitOffers } from '../../couponModel.js'
import { offerLink, setHubLinks } from '../../offerLink.js'
import { PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

export const DECK_SIZE = 10
// 정본은 couponModel.js conditionTable의 rowOf(내보내지 않음). 시안이라 복사하고 data.test.js가 정본과 맞댄다.
export const MIN_UNKNOWN = '최소주문 미확인'
export const AMOUNT_UNKNOWN = '금액 ?'
export const NONE = '-'

export async function loadStories(initial) {
  const brands = initial?.brands ?? await fetchBrands()
  const banners = initial?.banners ?? await fetchBanners().catch(() => [])
  setHubLinks(banners)
  return { brands, banners }
}

/** 최소주문 표시. 모르면 비우지 않고 기존 라벨, 없음은 그대로, 아니면 `n원↑`(conditionTable 꼴). */
export function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return MIN_UNKNOWN
  if (offer.minOrderAmount === 0) return label
  return `${label}원↑`
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** `MM.DD HH:mm 기준`(KST). 시각이 없으면 null(지어내지 않는다). 상대 시간은 쓰지 않는다. */
export function capturedText(capturedAt) {
  if (!capturedAt) return null
  const t = Date.parse(capturedAt)
  if (!Number.isFinite(t)) return null
  const p = Object.fromEntries(KST.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  return `${p.month}.${p.day} ${p.hour}:${p.minute} 기준`
}

const amountOf = (offer) => amountText(offer) || AMOUNT_UNKNOWN

function toRows(brand, include) {
  return PLATFORMS.map((p) => {
    const offers = brand.offers.filter((o) => o.platform === p.key)
    if (offers.length === 0) return { key: p.key, label: p.label, amount: NONE, min: null, link: null }
    const hero = splitOffers(offers, include).best[0]
    return {
      key: p.key,
      label: p.label,
      amount: amountOf(hero),
      min: minText(hero),
      link: offerLink(hero, brand.links, brand.name),
    }
  })
}

export function toCard(brand, include) {
  const hero = splitOffers(brand.offers, include).best[0]
  const platform = PLATFORM_BY_KEY[hero.platform]
  return {
    name: brand.name,
    category: brand.category,
    hero,
    amount: amountOf(hero),
    platformKey: hero.platform,
    platformLabel: platform?.label ?? hero.platform,
    chips: headOrder(chipsOf(hero).filter(onCard)),
    min: minText(hero),
    link: offerLink(hero, brand.links, brand.name),
    capturedAt: latestCaptured(brand.offers),
    captured: capturedText(latestCaptured(brand.offers)),
    rows: toRows(brand, include),
  }
}

/** deck: 오늘 큰 할인 10곳(운영 목록 순서의 앞에서부터 확정 금액이 있는 곳). list: 일반 목록 전체. */
export function toStories(brands) {
  const filters = defaultFilters()
  const include = includesFrom(filters)
  const ordered = applyFilters(brands, filters)
  const deckBrands = []
  for (const b of ordered) {
    if (deckBrands.length >= DECK_SIZE) break
    if (displayBestAmount(b.offers, include) != null) deckBrands.push(b)
  }
  return { deck: deckBrands.map((b) => toCard(b, include)), list: ordered.map((b) => toCard(b, include)) }
}
