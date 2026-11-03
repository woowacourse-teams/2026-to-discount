// 홈 리뉴얼 시안 "할인 순위판" 어댑터(#239). 기존 모듈을 불러 껍데기용 모양으로 바꾸기만 한다.
// 계산은 막대 비율(barPercent) 하나뿐이다. 시안이라 아래 문구는 임시다 - 한 자리에 모았다.
import { amountText, chipsOf, headOrder, minLabel, onCard } from '../../couponModel.js'
import { applyFilters, comparable, defaultFilters, displayBestAmount, latestCaptured, sortBrands } from '../../filters.js'
import { offerLink } from '../../offerLink.js'
import { ranks } from '../../popularStrip.js'

export const COPY = {
  title: '오늘의 할인 순위',
  tabAmount: '할인액',
  tabPopular: '인기',
  go: '받으러 가기',
  noMin: '최소주문 미확인', // 기존 정식 라벨(couponModel conditionTable)
  loading: '불러오는 중',
  failed: '목록을 불러오지 못했어요',
  empty: '보여 줄 할인이 없어요',
  retry: '다시 시도',
  summary: (apps, brands, at) => `${apps}개 앱 · ${brands}개 브랜드${at ? ` · ${at} 기준` : ''}`,
  minOrder: (label) => `최소주문 ${label}원↑`,
}

export const TOP_N = 10
export const POPULAR_MIN = 3 // popularStrip.STRIP_MIN과 같다(새벽에는 인기 순위가 의미 없다)

const APP_NAME = { baemin: '배민', coupangeats: '쿠팡이츠', yogiyo: '요기요', ddangyo: '땡겨요' }

function visible(brands) {
  return applyFilters(brands ?? [], defaultFilters())
}

/** 'MM-DD HH:mm' (한국 시각). 못 읽으면 null. */
export function stamp(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`
}

function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label == null) return COPY.noMin
  return offer.minOrderAmount > 0 ? COPY.minOrder(label) : label
}

function rowOf(brand, rank, top) {
  const amount = displayBestAmount(brand.offers)
  if (amount == null) return null
  const offer = brand.offers.find((o) => comparable(o) && o.amount === amount && !o.soldOut)
  if (!offer) return null
  const chips = headOrder(chipsOf(offer).filter(onCard)).map((c) => c.text)
  return {
    rank,
    brand,
    offer,
    amount,
    label: amountText(offer),
    app: APP_NAME[offer.platform] ?? offer.platform,
    min: minText(offer),
    chips,
    capturedAt: stamp(latestCaptured(brand.offers)),
    href: offerLink(offer, brand.links, brand.name),
    bar: top > 0 ? Math.round((amount / top) * 1000) / 10 : 0, // 그림 눈금
  }
}

/** 순위 행 최대 10개. tab: 'amount' | 'popular'. */
export function rankingRows(brands, tab) {
  const list = visible(brands)
  let picked
  if (tab === 'popular') {
    const rk = ranks(list, 'popularityToday')
    picked = list.filter((b) => rk.has(b.name)).sort((a, b) => rk.get(a.name) - rk.get(b.name)).map((b) => ({ b, rank: rk.get(b.name) }))
  } else {
    const sorted = sortBrands(list, { sorts: [{ key: 'amount', dir: 'desc' }] })
    let prev = null
    let prevRank = 0
    picked = sorted.map((b, i) => {
      const v = displayBestAmount(b.offers)
      const rank = v != null && v === prev ? prevRank : i + 1
      prev = v
      prevRank = rank
      return { b, rank }
    })
  }
  const withAmount = picked.filter(({ b }) => displayBestAmount(b.offers) != null).slice(0, TOP_N)
  // 막대 눈금은 두 탭이 같게, 전체 최고 할인액 기준
  const top = Math.max(0, ...list.map((b) => displayBestAmount(b.offers) ?? 0))
  return withAmount.map(({ b, rank }) => rowOf(b, rank, top)).filter(Boolean)
}

export function popularAvailable(brands) {
  return ranks(visible(brands), 'popularityToday').size >= POPULAR_MIN
}

/** 머리줄 값: 앱 수, 브랜드 수, 가장 최근 시각. */
export function summaryOf(brands) {
  const list = visible(brands)
  const apps = new Set(list.flatMap((b) => b.offers.map((o) => o.platform)))
  const latest = list.map((b) => latestCaptured(b.offers)).filter(Boolean).reduce((a, b) => (a > b ? a : b), null)
  return COPY.summary(apps.size, list.length, stamp(latest))
}
