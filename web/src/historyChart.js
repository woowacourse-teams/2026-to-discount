// 브랜드 최고 할인 선(설계 2026-10-09). 실선 = 그날 본 값, 점선 = 못 봐서 이어 그린 값, 끊김 = 할인 없음.
const PAD = 6

export function chartModel(points, width, height) {
  const drawable = points.filter((p) => p.amount != null)
  if (drawable.length < 2) return null
  const t0 = Date.parse(points[0].date)
  const span = Math.max(1, Date.parse(points[points.length - 1].date) - t0)
  const yMax = Math.max(...drawable.map((p) => p.amount))
  const x = (p) => PAD + ((Date.parse(p.date) - t0) / span) * (width - 2 * PAD)
  const y = (p) => height - PAD - (yMax === 0 ? 0 : (p.amount / yMax) * (height - 2 * PAD))
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
    dots: drawable.map((p) => ({ x: x(p), y: y(p), hollow: p.line === 'carried', reason: p.reason ?? null })),
    yMax,
  }
}
