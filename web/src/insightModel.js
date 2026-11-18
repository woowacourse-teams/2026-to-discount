// /insight 화면의 계산(순수 함수). 그리기는 InsightPage.jsx, 곡선 잇기는 historyChart.js의 linePaths를 그대로 쓴다.
// 규칙(이슈 #403): 이어 쓴 값은 점선, 값 없음(null)은 끊김, 실제 0은 0으로 그린다. 비율은 분모 30 미만이면 그리지 않는다.
import { linePaths, niceDomain } from './historyChart.js'

export const MIN_N = 30
export const APPS = ['baemin', 'coupangeats', 'yogiyo', 'ddangyo']
export const SHORT = { baemin: '배민', coupangeats: '쿠팡이츠', yogiyo: '요기요', ddangyo: '땡겨요' }
// 앱 고유색(shells/my-brands-v2/parts.jsx BTN_BG와 같은 값, 배민만 앱 민트).
export const COLOR = { baemin: '#2ac1bc', coupangeats: '#4d2610', yogiyo: '#fa0050', ddangyo: '#fb521c' }
export const INDEX_BASE = '2026-09-01' // 지수 100인 날(설계 §요소 평가표)

export const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

// {amount, carried} 또는 null → 곡선 점. historyChart.js와 같은 line 값(solid, carried, break)을 쓴다.
export function toPoint(date, v) {
  if (v == null || v.amount == null) return { date, amount: null, line: 'break' }
  return { date, amount: v.amount, line: v.carried ? 'carried' : 'solid' }
}

// B 추이의 한 앱 값. 그날 그 앱을 하나도 못 보고 전부 이어 쓴 날(carriedShare 1)만 점선으로 본다.
// ponytail: 중앙값은 이어 쓴 값이 섞여도 한 숫자라 "전부 이어 쓴 날"만 가른다. 비율로 가르려면 문턱을 정해야 한다.
export function trendPoints(days, app, mode = 'won') {
  const raw = days.map((d) => toPoint(d.date, d.median?.[app] == null ? null
    : { amount: d.median[app], carried: (d.carriedShare?.[app] ?? 0) >= 1 }))
  if (mode !== 'index') return raw
  const base = raw.find((p) => p.date >= INDEX_BASE && p.amount > 0)?.amount
  if (!base) return raw.map((p) => ({ ...p, amount: null, line: 'break' }))
  return raw.map((p) => (p.amount == null ? p : { ...p, amount: Math.round((p.amount / base) * 1000) / 10 }))
}

// 여러 선을 같은 축에 놓는다. series: [{key, points}] (points 길이는 모두 같다). 반환 y가 null이면 끊김.
export function plotLines(series, { w = 320, h = 160, left = 30, right = 8, top = 10, bottom = 18 } = {}) {
  const all = series.flatMap((s) => s.points.map((p) => p.amount)).filter((a) => a != null)
  const len = series[0]?.points.length ?? 0
  if (all.length < 2 || len < 2) return null
  const [lo, hi] = niceDomain(Math.min(...all), Math.max(...all))
  const r = (n) => Math.round(n * 10) / 10
  const x = (i) => r(left + (i / (len - 1)) * (w - left - right))
  const y = (v) => r(top + ((hi - v) / (hi - lo)) * (h - bottom - top))
  const lines = series.map(({ key, points }) => {
    const xy = points.map((p, i) => ({ x: x(i), y: p.amount == null ? null : y(p.amount), line: p.line }))
    const { solid, carried } = linePaths(xy, h - bottom)
    return { key, xy, solid, carried }
  })
  return { lines, lo, hi, yLo: y(lo), yHi: y(hi), x }
}

// 더 크게 보인 날의 비율. 분모가 30 미만이면 null(그리지 않음), 비율이 null인 앱은 뺀다.
export function shareRows(block, apps = APPS) {
  if (!block || !(block.n >= MIN_N)) return null
  const rows = apps.filter((a) => block.share?.[a] != null).map((a) => ({ app: a, share: block.share[a] }))
  return rows.length ? rows.sort((p, q) => q.share - p.share) : null
}

// 히트맵 칸 단계. null = 값 없음(빈칸), 0 = 할인 없음, 1~4 = 금액 구간.
export const HEAT_STEPS = [2000, 4000, 6000]
export function heatLevel(cell) {
  if (cell == null || cell.max == null) return null
  if (cell.max <= 0) return 0
  return 1 + HEAT_STEPS.filter((s) => cell.max >= s).length
}

// 주간 변동: 앱 하나면 그 앱, 전체면 앱을 더한다.
export function weekly(byApp, apps, len) {
  return Array.from({ length: len }, (_, i) => apps.reduce((s, a) => s + (byApp?.[a]?.[i] ?? 0), 0))
}
