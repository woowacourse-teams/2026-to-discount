import { useEffect, useRef, useState } from 'react'
import { fetchHistory } from './api.js'
import { callouts, chartModel, nearestIndex, placeCallout, summary, GUTTER, H, W, BOTTOM, PILL_H, TOP } from './historyChart.js'
import { won } from './OfferChip.jsx'
import HistoryPlatformChips from './HistoryPlatformChips.jsx'
import { useChartScrub } from './useChartScrub.js'
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
  const [platform, setPlatform] = useState(null) // null = 전체
  const [data, setData] = useState(null)
  const svgRef = useRef(null)
  const { sel, setSel, bind } = useChartScrub(svgRef, data, brand, range)
  useEffect(() => {
    let live = true
    fetchHistory(brand, range === '2w' ? '1m' : range).then((d) => { if (live) { setData(d); setSel(null) } })
    return () => { live = false }
  }, [brand, range])
  // 앱별 곡선은 응답에 같이 온다. byPlatform 칸이 없으면 앱 구분을 모르는 옛 API라 칩을 숨기고 전체만 보인다.
  const byPlatform = data?.byPlatform
  const all = (platform ? byPlatform?.[platform] : data?.best) ?? []
  const pts = range === '2w' && all.length ? all.filter((p) => Date.parse(p.date) >= Date.parse(all[all.length - 1].date) - TWO_WEEKS_MS) : all
  const m = chartModel(pts)
  // 앱을 골랐는데 점이 모자라면 칩은 남겨 다른 앱으로 돌아갈 수 있게 한다. 전체일 때는 예전처럼 아무것도 안 그린다.
  const plats = !byPlatform ? null : <HistoryPlatformChips value={platform} onChange={(k) => { setSel(null); setPlatform(k) }} className="hist__plats" chipClassName="hist__plat" />
  if (!m) return platform ? <figure className="hist"><div className="hist__head"><figcaption className="hist__title">할인 기록</figcaption></div>{plats}{data && <p className="hist__empty">이 앱의 할인 기록이 아직 없어요</p>}</figure> : null
  const sum = summary(pts)
  const xs = m.xy.map((p) => p.x)
  const pills = callouts(pts, m.xy)
  let cur = pts.length - 1
  while (pts[cur].amount == null) cur--
  const midI = nearestIndex((xs[0] + xs[xs.length - 1]) / 2, xs)
  const xTicks = [[0, 'start'], [midI, 'middle'], [pts.length - 1, 'end']]
  const { svgProps, onKey } = bind(pts, xs, W)

  const sp = sel != null ? pts[sel] : null
  // 말풍선 대신 판 없는 값 표시(2026-10-14 사용자). 최고, 현재, 누른 점 모두 같은 모양과 자리 규칙이다.
  const at = (c) => ({ left: `${(c.cx / W) * 100}%`, top: `${(c.top / H) * 100}%` })

  return (
    <figure className="hist" tabIndex={0} onKeyDown={onKey} onBlur={() => setSel(null)}
      aria-label={`할인 기록${sum ? `, 최고 ${won(sum.max)} 할인 ${md(sum.maxDate)}` : ''}. 좌우 화살표로 날짜 선택`}>
      <div className="hist__head">
        <figcaption className="hist__title">할인 기록</figcaption>
        <div className="hist__tabs" role="group" aria-label="기간">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" className="hist__tab" aria-pressed={range === k}
              onClick={() => { if (k !== range) track('history_range_change', { brand, from: range, to: k }); setSel(null); setRange(k) }}>{label}</button>
          ))}
        </div>
      </div>
      {plats}
      <div className="hist__wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="hist__svg" aria-hidden="true" {...svgProps}>
          <line x1={GUTTER} y1={m.yHi} x2={W} y2={m.yHi} className="hist__grid" />
          <line x1={GUTTER} y1={m.yLo} x2={W} y2={m.yLo} className="hist__grid" />
          <text x={GUTTER - 6} y={m.yHi} className="hist__ytick">{num(m.hi)}</text>
          <text x={GUTTER - 6} y={m.yLo} className="hist__ytick">{num(m.lo)}</text>
          {m.area.map((d, i) => <path key={`a${i}`} d={d} className="hist__area" />)}
          {m.solid.map((d, i) => <path key={`s${i}`} d={d} className="hist__solid" />)}
          {xTicks.map(([i, anchor]) => (
            <text key={anchor} x={xs[i]} y={H - 4} textAnchor={anchor} className="hist__xtick">{md(pts[i].date)}</text>
          ))}
          {sel == null && pills.map((c) => (
            <line key={`g${c.i}`} x1={xs[c.i]} y1={c.top + PILL_H} x2={xs[c.i]} y2={m.xy[c.i].y} className="hist__guide" />
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
                <span className="hist__tip-d">{md(sp.date)}{sp.line === 'carried' && ' 기록 없음'}</span>
                <b>{sp.amount == null ? '할인 없음' : `${won(sp.amount)} 할인`}</b>
              </div>
            </>
          )
        })()}
      </div>
    </figure>
  )
}
