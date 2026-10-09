// 브랜드 최고 할인 선(설계 2026-10-09). 실선 = 그날 본 값, 점선 = 못 봐서 이어 그린 값, 끊김 = 할인 없음.
const PAD = 6
export const TOP = 28 // 변곡점 라벨(두 줄) 자리
export const LABEL_W = 40
export const LABEL_H = 22

export function chartModel(points, width, height) {
  const drawable = points.filter((p) => p.amount != null)
  if (drawable.length < 2) return null
  const t0 = Date.parse(points[0].date)
  const span = Math.max(1, Date.parse(points[points.length - 1].date) - t0)
  const yMax = Math.max(...drawable.map((p) => p.amount))
  const x = (p) => PAD + ((Date.parse(p.date) - t0) / span) * (width - 2 * PAD)
  const y = (p) => height - PAD - (yMax === 0 ? 0 : (p.amount / yMax) * (height - PAD - TOP))
  const solid = []
  const carried = []
  let run = null
  let prev = null
  for (const p of points) {
    if (p.line === 'break') { run = null; prev = null; continue }
    const pt = `${x(p).toFixed(1)},${y(p).toFixed(1)}`
    const kind = p.line === 'carried' ? 'carried' : 'solid'
    if (prev && (kind === 'carried' || prev.kind === 'carried')) carried.push(`${prev.pt} ${pt}`)
    if (kind === 'solid' && prev?.kind === 'solid') run.push(pt)
    else if (kind === 'solid') { run = [pt]; solid.push(run) }
    prev = { pt, kind }
  }
  return {
    solid: solid.filter((r) => r.length > 1).map((r) => r.join(' ')),
    carried,
    pts: points.map((p) => ({ x: x(p), y: p.amount == null ? null : y(p) })),
    yMax,
  }
}

// 이전 그릴 수 있는 점과 금액이 달라진 점 + 첫/끝 점 + 끊김 뒤 첫 점의 인덱스.
export function inflections(points) {
  const out = []
  let prev = null
  let afterBreak = false
  points.forEach((p, i) => {
    if (p.amount == null) { afterBreak = true; return }
    if (!prev || afterBreak || p.amount !== prev.amount) out.push(i)
    prev = p
    afterBreak = false
  })
  let last = -1
  points.forEach((p, i) => { if (p.amount != null) last = i })
  if (last >= 0 && out[out.length - 1] !== last) out.push(last)
  return out
}

// items: [{i,x,y}] x 오름차순. 가로로 labelW보다 가까우면 앞 것을 버리고 뒤 것을 남긴다.
// 가장자리는 안쪽으로 밀고, 위에 자리가 없으면 점 아래(below)에 둔다.
export function labelLayout(items, width, labelW = LABEL_W, labelH = LABEL_H, gap = 4) {
  const lo = labelW / 2
  const hi = width - labelW / 2
  const placed = items.map((it) => ({ ...it, lx: Math.min(hi, Math.max(lo, it.x)), below: it.y - gap - labelH < 0 }))
  const kept = []
  for (let k = placed.length - 1; k >= 0; k--) {
    const last = kept[kept.length - 1]
    if (!last || last.lx - placed[k].lx >= labelW) kept.push(placed[k])
  }
  return kept.reverse()
}

export function nearestIndex(xPx, xs) {
  let best = 0
  xs.forEach((x, i) => { if (Math.abs(x - xPx) < Math.abs(xs[best] - xPx)) best = i })
  return best
}
