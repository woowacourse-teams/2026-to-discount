import { useEffect, useRef, useState } from 'react'
import { fetchHistory } from './api.js'
import { callouts, chartModel, nearestIndex, placeCallout, summary, GUTTER, H, W, BOTTOM, PILL_H, TOP } from './historyChart.js'
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

  // 그래프 위 끌기는 날짜 고르기다. 바텀시트 끌어 닫기로 올라가지 않게 막는다.
  const pick = (e) => {
    e.stopPropagation()
    clearTimeout(timer.current)
    const r = svgRef.current.getBoundingClientRect()
    setSel(nearestIndex(((e.clientX - r.left) / r.width) * W, xs))
  }
  // 터치는 손을 떼도 잠깐 남겨 읽을 시간을 준다. 마우스는 올려둔 동안만.
  const onUp = (e) => {
    e.stopPropagation()
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
  // 변곡점 말풍선과 눌렀을 때 말풍선은 같은 모양(.hist__tip), 같은 자리 규칙이다.
  const at = (c) => ({ left: `${(c.cx / W) * 100}%`, top: `${(c.top / H) * 100}%` })
  // 말풍선이 가장자리에서 안쪽으로 밀려도 꼬리와 점은 실제 날짜 위치를 가리킨다.
  const tail = (c, y) => {
    const up = false
    return <i className={`hist__tail${up ? ' hist__tail--up' : ''}`} aria-hidden="true"
      style={{ left: `${(m.xy[c.i].x / W) * 100}%`, top: `${((up ? c.top : c.top + PILL_H) / H) * 100}%` }} />
  }

  return (
    <figure className="hist" tabIndex={0} onKeyDown={onKey} onBlur={() => setSel(null)}
      aria-label={`할인 그래프${sum ? `, 최고 ${won(sum.max)}, 최저 ${won(sum.min)}` : ''}. 좌우 화살표로 날짜 선택`}>
      <div className="hist__head">
        <figcaption className="hist__title">할인 그래프</figcaption>
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
            <line key={`g${c.i}`} x1={xs[c.i]} y1={c.top + PILL_H} x2={xs[c.i]} y2={m.xy[c.i].y} className="hist__guide" />
          ))}
          {(sel == null ? pills.map((c) => c.i) : m.xy[sel].y == null ? [] : [sel]).map((i) => (
            <circle key={i} cx={xs[i]} cy={m.xy[i].y} r="3.5" className="hist__dot" />
          ))}
          {sel != null && <line x1={xs[sel]} y1={TOP} x2={xs[sel]} y2={H - BOTTOM} className="hist__guide" />}
        </svg>
        {sel == null && pills.map((c) => (
          <div key={c.i}>
            <div className="hist__tip" style={at(c)}>
              <span className="hist__tip-d">{md(pts[c.i].date)}</span>
              <b>{won(pts[c.i].amount)}</b>
            </div>
            {tail(c, m.xy[c.i].y)}
          </div>
        ))}
        {sp && (() => {
          const yy = m.xy[sel].y ?? m.yLo
          const c = placeCallout(m.xy.map((p) => ({ ...p, y: p.y ?? m.yLo })), sel)
          return (
            <>
              <div className="hist__tip" role="status" style={at(c)}>
                <span className="hist__tip-d">{md(sp.date)}{sp.line === 'carried' && ' 수집 안 됨'}</span>
                <b>{sp.amount == null ? '할인 없음' : won(sp.amount)}</b>
              </div>
              {tail(c, yy)}
            </>
          )
        })()}
      </div>
    </figure>
  )
}
