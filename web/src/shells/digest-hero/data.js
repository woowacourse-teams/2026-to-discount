// digest-hero 시안의 얇은 어댑터(#282). 기존 모듈 결과를 화면 모양으로 옮기기만 한다.
// 계산, 정렬, 판정을 새로 쓰지 않는다. 문구는 컴포넌트가 정한다(여기는 키와 값만).
import {
  applyFilters,
  defaultFilters,
  displayBestAmount,
  hasNewBest,
  includesFrom,
  isBundle,
  latestCaptured,
} from '../../filters.js'
import { amountText, badgesOf, chipsOf, minLabel, shortBrandName, splitOffers } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS, PLATFORM_BY_KEY } from '../../platforms.js'

const ROW_LIMIT = 10

// 정렬을 둘로 준다: 기본값과 정확히 같으면 applyFilters가 신규를 맨 위로 끌어올려 큰 카드가 "최고 금액"이 아니게 된다.
const HERO_SORTS = [{ key: 'amount', dir: 'desc' }, { key: 'minOrder', dir: 'asc' }]

const EMPTY = { summary: null, hero: null, rows: [] }

function minText(offer) {
  const label = minLabel(offer.minOrderAmount)
  if (label === null) return '최소주문 미확인'
  return offer.minOrderAmount === 0 ? label : `${label}원 이상`
}

function appCell(platform, ordered) {
  const offer = ordered.find((o) => o.platform === platform.key)
  if (!offer) return { key: platform.key, label: platform.label, state: 'none', amount: '', soldOut: false, chips: [] }
  const unknown = !isBundle(offer) && offer.amount == null
  return {
    key: platform.key,
    label: platform.label,
    state: unknown ? 'unknown' : 'ok',
    amount: amountText(offer), // 모르면 rawText, 그것도 없으면 빈 문자열
    soldOut: !!offer.soldOut,
    chips: badgesOf(offer).filter((b) => b.kind.startsWith('qualifier-')),
  }
}

// source: 필터 전 원본 브랜드. 기본 필터(5천원 미만, 금액 없음 제거)가 오퍼를 지우면 "모름"이 "없음"으로 그려지므로
// 앱 칸은 원본 오퍼에서 읽는다. 대표 오퍼와 시각은 필터를 거친 brand를 따른다.
function toRow(brand, include, source) {
  const split = splitOffers(brand.offers, include)
  const main = split.best[0]
  const all = splitOffers(source.offers, include)
  const ordered = [...all.best, ...all.rest, ...all.bundles.filter((b) => !all.best.includes(b) && !all.rest.includes(b))]
  const chipTexts = chipsOf(main).filter((c) => c.scope === 'offer')
  const note = main.conditions && !chipTexts.some((c) => c.text === main.conditions) ? main.conditions : ''
  return {
    name: brand.name,
    shortName: shortBrandName(brand),
    logoName: brand.name,
    main: {
      amount: amountText(main),
      platformLabel: PLATFORM_BY_KEY[main.platform]?.label ?? '',
      href: offerLink(main, brand.links, brand.name),
      minText: minText(main),
      chips: chipTexts.map(({ kind, text }) => ({ kind, text })),
      note,
    },
    apps: PLATFORMS.map((p) => appCell(p, ordered)),
    capturedAt: latestCaptured(brand.offers),
  }
}

/** fetchBrands()가 준 배열 → { summary, hero, rows }. 비면 { summary: null, hero: null, rows: [] }. */
export function buildDigestHero(brands) {
  if (!Array.isArray(brands) || brands.length === 0) return EMPTY
  const filters = { ...defaultFilters(), sorts: HERO_SORTS }
  const list = applyFilters(brands, filters)
  if (list.length === 0) return EMPTY
  const include = includesFrom(filters)
  const original = new Map(brands.map((b) => [b.name, b]))
  const toRowOf = (b) => toRow(b, include, original.get(b.name) ?? b)
  return {
    summary: {
      count: list.length,
      best: displayBestAmount(list[0].offers, include),
      fresh: list.filter((b) => hasNewBest(b.offers, include)).length,
    },
    hero: toRowOf(list[0]),
    rows: list.slice(1, ROW_LIMIT + 1).map(toRowOf),
  }
}

// 한국 시각 표기. 서버(UTC)와 브라우저가 같은 값을 내도록 시간대를 박는다.
const KST_TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })
const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

/** 한국 날짜 문자열(YYYY-MM-DD). 오늘 판정에 쓴다. */
export function kstDay(date) {
  return KST_DAY.format(date)
}

/** capturedAt → "HH:mm". today(한국 날짜)를 주고 오늘이 아니면 "M/D HH:mm". null이면 빈 문자열. */
export function capturedLabel(iso, today = null) {
  const t = iso ? new Date(iso) : null
  if (!t || Number.isNaN(t.getTime())) return ''
  const time = KST_TIME.format(t).replace(/^24:/, '00:')
  const day = kstDay(t)
  if (!today || day === today) return time
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} ${time}`
}
