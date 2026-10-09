import { useEffect, useState } from 'react'
import { fetchHistory } from './api.js'
import { chartModel } from './historyChart.js'
import { won } from './OfferChip.jsx'
import './styles/hist.css'

const W = 300
const H = 96
// 2026-10-09 사용자: 제목 "할인 이력", 축은 날짜/할인금액.
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

// 열릴 때만 받는다. 이력이 없거나 점이 둘 미만이면 아무것도 안 그린다(시트는 그대로).
export default function BestHistoryChart({ brand }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    fetchHistory(brand).then((d) => { if (live) setData(d) })
    return () => { live = false }
  }, [brand])
  const m = data && chartModel(data.best ?? [], W, H)
  if (!m) return null
  const pts = data.best
  return (
    <figure className="hist">
      <figcaption className="hist__title">할인 이력</figcaption>
      <div className="hist__plot">
        <div className="hist__y" aria-hidden="true"><span>{won(m.yMax)}</span><span>0원</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} className="hist__svg" role="img" aria-label={`할인 이력, 최고 ${won(m.yMax)}`}>
          <line x1="0" y1={H} x2={W} y2={H} className="hist__axis" />
          <line x1="0" y1="0" x2="0" y2={H} className="hist__axis" />
          {m.solid.map((p, i) => <polyline key={`s${i}`} points={p} fill="none" className="hist__solid" />)}
          {m.carried.map((p, i) => <polyline key={`c${i}`} points={p} fill="none" className="hist__carried" />)}
          {m.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="2.5" className={d.hollow ? 'hist__dot hist__dot--hollow' : 'hist__dot'} />)}
        </svg>
        <span />
        <div className="hist__x" aria-hidden="true"><span>{md(pts[0].date)}</span><span>{md(pts[pts.length - 1].date)}</span></div>
      </div>
    </figure>
  )
}
