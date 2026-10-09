// 브랜드 최고 할인 계단선(2026-10-09 다시 그림). 실선 = 그날 본 값, 점선 = 못 봐서 이어 그린 값, 끊김 = 할인 없음.
// 금액은 하루 단위 값이라 다음 날짜까지 그대로 유지했다가 세로로 바뀐다(계단).
export const W = 320
export const H = 150
export const GUTTER = 36 // 금액 축 숫자 자리
export const RIGHT = 8
export const TOP = 32 // 말풍선 자리
export const BOTTOM = 18 // 날짜 축 자리
export const PILL_W = 46
export const PILL_H = 28
const STEP = 1000

// 최솟값 아래 1,000원 단위 바닥 ~ 최댓값 이상 1,000원 단위 천장. 0에서 시작하지 않는다.
export function niceDomain(min, max) {
  let lo = Math.floor(min / STEP) * STEP
  if (lo === min) lo -= STEP
  lo = Math.max(0, lo)
  let hi = Math.ceil(max / STEP) * STEP
  if (hi <= lo) hi = lo + STEP
  return [lo, hi]
}

// 실선 점만으로 최고(날짜 포함)·최저·평균(100원 단위 반올림).
export function summary(points) {
  const s = points.filter((p) => p.line === 'solid' && p.amount != null)
  if (!s.length) return null
  let max = s[0]
  for (const p of s) if (p.amount > max.amount) max = p
  const avg = Math.round(s.reduce((a, p) => a + p.amount, 0) / s.length / 100) * 100
  return { max: max.amount, maxDate: max.date, min: Math.min(...s.map((p) => p.amount)), avg }
}

// xy: [{x, y|null, line}]. 이웃한 두 점 사이를 계단 한 칸으로 잇고, 같은 종류끼리 이어 붙인다.
export function stepPaths(xy, bottom) {
  const solid = []
  const area = []
  const carried = []
  let run = null
  const close = () => {
    if (!run) return
    const d = run.d.join(' ')
    if (run.kind === 'solid') { solid.push(d); area.push(`${d} V${bottom} H${run.x0} Z`) } else carried.push(d)
    run = null
  }
  for (let i = 1; i < xy.length; i++) {
    const a = xy[i - 1]
    const b = xy[i]
    if (a.y == null || b.y == null) { close(); continue }
    const kind = a.line === 'carried' || b.line === 'carried' ? 'carried' : 'solid'
    if (run && run.kind !== kind) close()
    if (!run) run = { kind, x0: a.x, d: [`M${a.x} ${a.y}`] }
    run.d.push(`H${b.x} V${b.y}`)
  }
  close()
  return { solid, area, carried }
}

export function chartModel(points) {
  const drawable = points.filter((p) => p.amount != null)
  if (drawable.length < 2) return null
  const amounts = drawable.map((p) => p.amount)
  const [lo, hi] = niceDomain(Math.min(...amounts), Math.max(...amounts))
  const t0 = Date.parse(points[0].date)
  const span = Math.max(1, Date.parse(points[points.length - 1].date) - t0)
  const r = (n) => Math.round(n * 10) / 10
  const x = (p) => r(GUTTER + ((Date.parse(p.date) - t0) / span) * (W - GUTTER - RIGHT))
  const yOf = (v) => r(TOP + ((hi - v) / (hi - lo)) * (H - BOTTOM - TOP))
  const xy = points.map((p) => ({ x: x(p), y: p.amount == null ? null : yOf(p.amount), line: p.line }))
  return { ...stepPaths(xy, H - BOTTOM), xy, lo, hi, yLo: yOf(lo), yHi: yOf(hi) }
}

export function nearestIndex(xPx, xs) {
  let best = 0
  xs.forEach((x, i) => { if (Math.abs(x - xPx) < Math.abs(xs[best] - xPx)) best = i })
  return best
}

// 최고점과 현재(마지막 그릴 수 있는) 점에만 말풍선. 겹치면 현재 것만 남긴다.
// 가장자리는 안쪽으로 밀고, 위에 자리가 없으면 점 아래에 둔다. 반환: [{i, cx, top}] (cx = 가운데, top = 위 끝)
export function callouts(points, xy, width = W, minX = GUTTER, w = PILL_W, h = PILL_H, gap = 6) {
  let cur = -1
  let mx = -1
  points.forEach((p, i) => {
    if (p.amount == null) return
    cur = i
    if (mx < 0 || p.amount > points[mx].amount) mx = i
  })
  if (cur < 0) return []
  const place = (i) => {
    const { x, y } = xy[i]
    const top = y - gap - h >= 0 ? y - gap - h : y + gap
    return { i, cx: Math.min(width - w / 2, Math.max(minX + w / 2, x)), top }
  }
  const c = place(cur)
  if (mx === cur) return [c]
  const m = place(mx)
  const overlap = Math.abs(m.cx - c.cx) < w && Math.abs(m.top - c.top) < h
  return overlap ? [c] : [m, c]
}
