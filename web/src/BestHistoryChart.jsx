import { useEffect, useState } from 'react'
import { fetchHistory } from './api.js'
import { chartModel } from './historyChart.js'
import { won } from './OfferChip.jsx'

const W = 300
const H = 96

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
  return (
    <figure className="hist">
      <svg viewBox={`0 0 ${W} ${H}`} className="hist__svg" role="img" aria-label={won(m.yMax)}>
        {m.solid.map((pts, i) => <polyline key={`s${i}`} points={pts} className="hist__solid" />)}
        {m.carried.map((pts, i) => <polyline key={`c${i}`} points={pts} className="hist__carried" />)}
        {m.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="2.5" className={d.hollow ? 'hist__dot hist__dot--hollow' : 'hist__dot'} />)}
      </svg>
    </figure>
  )
}
