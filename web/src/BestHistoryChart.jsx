import { useEffect, useRef, useState } from 'react'
import { fetchHistory } from './api.js'
import { callouts, chartModel, nearestIndex, summary, GUTTER, H, W, BOTTOM, PILL_W, PILL_H } from './historyChart.js'
import { won } from './OfferChip.jsx'
import './styles/hist.css'

const RANGES = [['1m', '1개월'], ['3m', '3개월'], ['all', '전체']]
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const num = (n) => n.toLocaleString('ko-KR')

// 열릴 때만 받는다. 이력이 없거나 점이 둘 미만이면 아무것도 안 그린다(시트는 그대로).
// 기간을 바꾸는 동안은 앞 그래프를 그대로 둔다(깜빡임 없음).
export default function BestHistoryChart({ brand }) {
  const [range, setRange] = useState('1m')
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(null)
  const svgRef = useRef(null)
  const timer = useRef(null)
  useEffect(() => {
    let live = true
    fetchHistory(brand, range).then((d) => { if (live) { setData(d); setSel(null) } })
    return () => { live = false }
  }, [brand, range])
  useEffect(() => () => clearTimeout(timer.current), [])
  const pts = data?.best ?? []
  const m = chartModel(pts)
  if (!m) return null
  const sum = summary(pts)
  const xs = m.xy.map((p) => p.x)
  const pills = callouts(pts, m.xy)
  let cur = pts.length - 1
  while (pts[cur].amount == null) cur--
  const midI = nearestIndex((xs[0] + xs[xs.length - 1]) / 2, xs)
  const xTicks = [[0, 'start'], [midI, 'middle'], [pts.length - 1, 'end']]

  const pick = (e) => {
    clearTimeout(timer.current)
    const r = svgRef.current.getBoundingClientRect()
    setSel(nearestIndex(((e.clientX - r.left) / r.width) * W, xs))
  }
  // 터치는 손을 떼도 잠깐 남겨 읽을 시간을 준다. 마우스는 올려둔 동안만.
  const onUp = (e) => {
    if (e.pointerType === 'mouse') return
    timer.current = setTimeout(() => setSel(null), 1500)
  }
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const d = e.key === 'ArrowLeft' ? -1 : 1
    setSel((s) => Math.min(pts.length - 1, Math.max(0, (s ?? (d < 0 ? pts.length : -1)) + d)))
  }
  const sp = sel != null ? pts[sel] : null
  const tipX = sel != null ? Math.min(86, Math.max(14, (xs[sel] / W) * 100)) : 0

  return (
    <figure className="hist" tabIndex={0} onKeyDown={onKey} onBlur={() => setSel(null)}
      aria-label={`할인 이력${sum ? `, 최고 ${won(sum.max)}, 최저 ${won(sum.min)}` : ''}. 좌우 화살표로 날짜 선택`}>
      <div className="hist__head">
        <figcaption className="hist__title">할인 이력</figcaption>
        <div className="hist__tabs" role="group">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" className="hist__tab" aria-pressed={range === k}
              onClick={() => setRange(k)}>{label}</button>
          ))}
        </div>
      </div>
      {sum && (
        <dl className="hist__sum">
          <div><dt>최고</dt><dd>{won(sum.max)} · {md(sum.maxDate)}</dd></div>
          <div><dt>최저</dt><dd>{won(sum.min)}</dd></div>
          <div><dt>평균</dt><dd>{won(sum.avg)}</dd></div>
        </dl>
      )}
      <div className="hist__wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="hist__svg" aria-hidden="true"
          onPointerDown={pick} onPointerMove={pick} onPointerUp={onUp} onPointerCancel={onUp}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setSel(null) }}>
          <line x1={GUTTER} y1={m.yHi} x2={W} y2={m.yHi} className="hist__grid" />
          <line x1={GUTTER} y1={m.yLo} x2={W} y2={m.yLo} className="hist__grid" />
          <text x={GUTTER - 6} y={m.yHi} className="hist__ytick">{num(m.hi)}</text>
          <text x={GUTTER - 6} y={m.yLo} className="hist__ytick">{num(m.lo)}</text>
          {m.area.map((d, i) => <path key={`a${i}`} d={d} className="hist__area" />)}
          {m.solid.map((d, i) => <path key={`s${i}`} d={d} className="hist__solid" />)}
          {m.carried.map((d, i) => <path key={`c${i}`} d={d} className="hist__carried" />)}
          {xTicks.map(([i, anchor]) => (
            <text key={anchor} x={xs[i]} y={H - 4} textAnchor={anchor} className="hist__xtick">{md(pts[i].date)}</text>
          ))}
          {sel == null && pills.map((c) => (
            <g key={c.i} className="hist__pill">
              <rect x={c.cx - PILL_W / 2} y={c.top} width={PILL_W} height={PILL_H} rx={PILL_H / 2} />
              {c.top < m.xy[c.i].y && <path d={`M${m.xy[c.i].x - 4},${c.top + PILL_H - 0.5} l4,4 l4,-4z`} />}
              <text x={c.cx} y={c.top + PILL_H / 2} dominantBaseline="central">
                <tspan className="hist__pill-d">{md(pts[c.i].date)}</tspan>
                <tspan className="hist__pill-v" dx="4">{won(pts[c.i].amount)}</tspan>
              </text>
            </g>
          ))}
          <circle cx={xs[cur]} cy={m.xy[cur].y} r="3.5" className="hist__dot" />
          {sel != null && <line x1={xs[sel]} y1="0" x2={xs[sel]} y2={H - BOTTOM} className="hist__guide" />}
        </svg>
        {sp && (
          <div className="hist__tip" role="status" style={{ left: `${tipX}%` }}>
            <span className="hist__tip-d">{md(sp.date)}</span>
            {sp.amount == null
              ? <b>할인 없음</b>
              : <><b>{won(sp.amount)}</b>{sp.line === 'carried' && <span className="hist__tip-d">수집 안 됨</span>}</>}
          </div>
        )}
      </div>
    </figure>
  )
}
