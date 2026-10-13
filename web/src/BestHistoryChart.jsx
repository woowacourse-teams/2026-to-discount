import { useEffect, useRef, useState } from 'react'
import { fetchHistory } from './api.js'
import { callouts, chartModel, nearestIndex, placeCallout, summary, GUTTER, H, W, BOTTOM, PILL_H, TOP } from './historyChart.js'
import { won } from './OfferChip.jsx'
import { track } from './analytics.js'
import './styles/hist.css'

// 2주는 API에 없다. 1달을 받아 마지막 14일만 그린다.
const RANGES = [['2w', '2주'], ['1m', '1달'], ['all', '전체']]
const TWO_WEEKS_MS = 13 * 864e5
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
  const drag = useRef(null) // 누른 채 끄는 중이면 { pointer, seen: 지나간 점 번호 }
  useEffect(() => {
    let live = true
    fetchHistory(brand, range === '2w' ? '1m' : range).then((d) => { if (live) { setData(d); setSel(null) } })
    return () => { live = false }
  }, [brand, range])
  useEffect(() => () => clearTimeout(timer.current), [])
  // 손가락 끌기: 처음 움직임이 위아래면 그대로 시트 스크롤·끌어 닫기에 맡긴다.
  // 좌우로 먼저 끌기 시작한 뒤에만 그 손짓이 끝날 때까지 시트로 올라가지 않게 막는다.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let g = null
    const ts = (e) => { const t = e.touches[0]; g = { x: t.clientX, y: t.clientY, dir: null } }
    const tm = (e) => {
      if (!g) return
      const t = e.touches[0]
      const dx = Math.abs(t.clientX - g.x)
      const dy = Math.abs(t.clientY - g.y)
      if (!g.dir && dx + dy > 4) g.dir = dx > dy ? 'x' : 'y'
      if (g.dir === 'x') { e.stopPropagation(); if (e.cancelable) e.preventDefault() }
    }
    const te = () => { g = null }
    el.addEventListener('touchstart', ts, { passive: true })
    el.addEventListener('touchmove', tm, { passive: false })
    el.addEventListener('touchend', te)
    el.addEventListener('touchcancel', te)
    return () => { el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm); el.removeEventListener('touchend', te); el.removeEventListener('touchcancel', te) }
  }, [data])
  const all = data?.best ?? []
  const pts = range === '2w' && all.length ? all.filter((p) => Date.parse(p.date) >= Date.parse(all[all.length - 1].date) - TWO_WEEKS_MS) : all
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
    e.stopPropagation()
    clearTimeout(timer.current)
    const r = svgRef.current.getBoundingClientRect()
    const i = nearestIndex(((e.clientX - r.left) / r.width) * W, xs)
    if (drag.current) drag.current.seen.add(i)
    setSel(i)
  }
  // 터치는 손을 떼도 잠깐 남겨 읽을 시간을 준다. 마우스는 올려둔 동안만.
  const onUp = (e) => {
    e.stopPropagation()
    // 누른 채 끌어 두 날짜 이상 지나갔으면 손을 뗄 때 한 번만 남긴다(2026-10-12 사용자). 움직일 때마다 보내면 폭증한다.
    const d = drag.current
    drag.current = null
    if (d && d.seen.size > 1) {
      track('history_drag', { brand, range, pointer: d.pointer, points: d.seen.size, last: pts[[...d.seen].pop()]?.date ?? null })
    }
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
  // 말풍선 대신 판 없는 값 표시(2026-10-14 사용자). 최고, 현재, 누른 점 모두 같은 모양과 자리 규칙이다.
  const at = (c) => ({ left: `${(c.cx / W) * 100}%`, top: `${(c.top / H) * 100}%` })

  return (
    <figure className="hist" tabIndex={0} onKeyDown={onKey} onBlur={() => setSel(null)}
      aria-label={`할인 기록${sum ? `, 최고 ${won(sum.max)} 할인 ${md(sum.maxDate)}` : ''}. 좌우 화살표로 날짜 선택`}>
      <div className="hist__head">
        <div>
          <figcaption className="hist__title">할인 기록</figcaption>
          {sum && <span className="hist__badge">최고 <b>{won(sum.max)}</b> {md(sum.maxDate)}</span>}
        </div>
        <div className="hist__tabs" role="group" aria-label="기간">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" className="hist__tab" aria-pressed={range === k}
              onClick={() => { if (k !== range) track('history_range_change', { brand, from: range, to: k }); setRange(k) }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="hist__wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="hist__svg" aria-hidden="true"
          onPointerDown={(e) => { track('history_point_select', { brand, range, pointer: e.pointerType || 'none' }); drag.current = { pointer: e.pointerType || 'none', seen: new Set() }; pick(e) }} onPointerMove={pick} onPointerUp={onUp} onPointerCancel={onUp}
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
            <g key={`g${c.i}`}>
              <line x1={xs[c.i]} y1={c.top + PILL_H} x2={xs[c.i]} y2={m.xy[c.i].y} className="hist__guide" />
              {/* 점에서 날짜 축까지 이어 값과 날짜가 한 줄로 읽히게 */}
              <line x1={xs[c.i]} y1={m.xy[c.i].y} x2={xs[c.i]} y2={H - BOTTOM} className="hist__drop" />
            </g>
          ))}
          {(sel == null ? pills.map((c) => c.i) : m.xy[sel].y == null ? [] : [sel]).map((i) => (
            <circle key={i} cx={xs[i]} cy={m.xy[i].y} r="3.5" className="hist__dot" />
          ))}
          {sel != null && <line x1={xs[sel]} y1={TOP - 6} x2={xs[sel]} y2={m.xy[sel].y ?? H - BOTTOM} className="hist__guide" />}
        </svg>
        {sel == null && pills.map((c) => (
          <div key={c.i}>
            <div className="hist__tip" style={at(c)}>
              <span className="hist__tip-d">{md(pts[c.i].date)}</span>
              <b>{won(pts[c.i].amount)} 할인</b>
            </div>
          </div>
        ))}
        {sp && (() => {
                const c = placeCallout(m.xy.map((p) => ({ ...p, y: p.y ?? m.yLo })), sel)
          return (
            <>
              <div className="hist__tip" role="status" style={at(c)}>
                <span className="hist__tip-d">{md(sp.date)}{sp.line === 'carried' && ' 수집 안 됨'}</span>
                <b>{sp.amount == null ? '할인 없음' : `${won(sp.amount)} 할인`}</b>
              </div>
            </>
          )
        })()}
      </div>
    </figure>
  )
}
