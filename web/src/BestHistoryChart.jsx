import { useEffect, useRef, useState } from 'react'
import { fetchHistory } from './api.js'
import { chartModel, inflections, labelLayout, nearestIndex, LABEL_H } from './historyChart.js'
import { won } from './OfferChip.jsx'
import './styles/hist.css'

const W = 300
const H = 120
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const num = (n) => n.toLocaleString('ko-KR')

function tipText(p) {
  if (p.amount == null) return `${md(p.date)} · 할인 없음`
  return `${md(p.date)} · ${won(p.amount)}${p.line === 'carried' ? ' (수집 안 됨)' : ''}`
}

// 열릴 때만 받는다. 이력이 없거나 점이 둘 미만이면 아무것도 안 그린다(시트는 그대로).
export default function BestHistoryChart({ brand }) {
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(null)
  const svgRef = useRef(null)
  const timer = useRef(null)
  useEffect(() => {
    let live = true
    fetchHistory(brand).then((d) => { if (live) setData(d) })
    return () => { live = false; clearTimeout(timer.current) }
  }, [brand])
  const m = data && chartModel(data.best ?? [], W, H)
  if (!m) return null
  const pts = data.best
  const xs = m.pts.map((p) => p.x)
  const labels = labelLayout(inflections(pts).map((i) => ({ i, x: m.pts[i].x, y: m.pts[i].y })), W)

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
  const tipX = sel != null ? Math.min(85, Math.max(15, (xs[sel] / W) * 100)) : 0

  return (
    <figure className="hist" tabIndex={0} onKeyDown={onKey} onBlur={() => setSel(null)}
      aria-label={`할인 이력, 최고 ${won(m.yMax)}. 좌우 화살표로 날짜 선택`}>
      <figcaption className="hist__title">할인 이력</figcaption>
      <div className="hist__plot">
        <div className="hist__y" aria-hidden="true"><span>{num(m.yMax)}</span><span>0</span></div>
        <div className="hist__wrap">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="hist__svg" aria-hidden="true"
            onPointerDown={pick} onPointerMove={pick} onPointerUp={onUp} onPointerCancel={onUp}
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') setSel(null) }}>
            <line x1="0" y1={H} x2={W} y2={H} className="hist__axis" />
            <line x1="0" y1="0" x2="0" y2={H} className="hist__axis" />
            {m.solid.map((p, i) => <polyline key={`s${i}`} points={p} fill="none" className="hist__solid" />)}
            {m.carried.map((p, i) => <polyline key={`c${i}`} points={p} fill="none" className="hist__carried" />)}
            {sel == null && labels.map((l) => {
              const ty = l.below ? l.y + 13 : l.y - 4 - LABEL_H + 9
              return (
                <text key={l.i} className="hist__lbl" x={l.lx} y={ty}>
                  <tspan x={l.lx}>{md(pts[l.i].date)}</tspan>
                  <tspan x={l.lx} dy="11">{won(pts[l.i].amount)}</tspan>
                </text>
              )
            })}
            {sel != null && <line x1={xs[sel]} y1="0" x2={xs[sel]} y2={H} className="hist__guide" />}
          </svg>
          {sel != null && <div className="hist__tip" role="status" style={{ left: `${tipX}%` }}>{tipText(pts[sel])}</div>}
        </div>
        <span />
        <div className="hist__x" aria-hidden="true"><span>{md(pts[0].date)}</span><span>{md(pts[pts.length - 1].date)}</span></div>
      </div>
    </figure>
  )
}
