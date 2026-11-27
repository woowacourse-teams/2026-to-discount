import { useEffect, useId, useRef, useState } from 'react'
import { fetchHistory } from './api.js'
import { callouts, overlayModel, nearestIndex, placeCallout, summary, PILL_H, TOP, BOTTOM, W } from './historyChart.js'
import { won } from './OfferChip.jsx'
import HistoryPlatformChips from './HistoryPlatformChips.jsx'
import { APP_COLOR, PLATFORMS, SHORT_LABEL } from './platforms.js'
import { useChartScrub } from './useChartScrub.js'
import { track } from './analytics.js'
import './styles/hist.css'

// 2주는 API에 없다. 1달을 받아 마지막 14일만 그린다.
const RANGES = [['2w', '2주'], ['1m', '1달'], ['all', '전체']]
const TWO_WEEKS_MS = 13 * 864e5
const H = 184 // 겹친 곡선이 숨 쉬게 키웠다(2026-11-28 사용자: 여백 넉넉히)
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const num = (n) => n.toLocaleString('ko-KR')
const BEST = 'best'
const colorOf = (k) => APP_COLOR[k] ?? 'var(--sale)'

// 열릴 때만 받는다. 이력이 없거나 점이 둘 미만이면 아무것도 안 그린다(시트는 그대로).
// 전체는 앱마다 제 색 곡선을 겹친다(/insight 날짜별 지표와 같은 꼴). 못 본 날은 점선.
export default function BestHistoryChart({ brand }) {
  const [range, setRange] = useState('1m')
  const [platform, setPlatform] = useState(null) // null = 전체
  const [data, setData] = useState(null)
  const svgRef = useRef(null)
  const gid = useId().replace(/:/g, '')
  const { sel, setSel, bind } = useChartScrub(svgRef, data, brand, range)
  useEffect(() => {
    let live = true
    fetchHistory(brand, range === '2w' ? '1m' : range).then((d) => { if (live) { setData(d); setSel(null) } })
    return () => { live = false }
  }, [brand, range])
  const byPlatform = data?.byPlatform
  const best = data?.best ?? []
  const last = best.length ? Date.parse(best[best.length - 1].date) : 0
  const clip = (ps) => (range === '2w' ? ps.filter((p) => Date.parse(p.date) >= last - TWO_WEEKS_MS) : ps)
  // 앱별 곡선이 없으면(옛 API) 전체 최고 한 줄
  const series = platform
    ? [{ key: platform, points: clip(byPlatform?.[platform] ?? []) }]
    : byPlatform
      ? PLATFORMS.map(({ key }) => ({ key, points: clip(byPlatform[key] ?? []) }))
      : [{ key: BEST, points: clip(best) }]
  const m = overlayModel(series, W, H)
  // 값 표시와 누르기는 한 줄을 기준으로 한다: 고른 앱, 아니면 전체 최고
  const pts = platform ? series[0].points : clip(best)
  const plats = !byPlatform ? null : <HistoryPlatformChips value={platform} onChange={(k) => { setSel(null); setPlatform(k) }} className="hist__plats" chipClassName="hist__plat" />
  const ranges = (
    <div className="hist__tabs" role="group" aria-label="기간">
      {RANGES.map(([k, label]) => (
        <button key={k} type="button" className="hist__tab" aria-pressed={range === k}
          onClick={() => { if (k !== range) track('history_range_change', { brand, from: range, to: k }); setSel(null); setRange(k) }}>{label}</button>
      ))}
    </div>
  )
  const head = <div className="hist__head"><figcaption className="hist__title">할인 기록</figcaption></div>
  if (!m || pts.filter((p) => p.amount != null).length < 2) {
    return platform ? <figure className="hist">{head}<div className="hist__bar">{plats}{ranges}</div>{data && <p className="hist__empty">이 앱의 할인 기록이 아직 없어요</p>}</figure> : null
  }
  const sum = summary(pts)
  const xy = pts.map((p) => ({ x: m.x(p.date), y: p.amount == null ? null : m.y(p.amount) }))
  const xs = xy.map((p) => p.x)
  const pills = callouts(pts, xy)
  const midI = nearestIndex((xs[0] + xs[xs.length - 1]) / 2, xs)
  const xTicks = [[0, 'start'], [midI, 'middle'], [pts.length - 1, 'end']]
  const { svgProps, onKey } = bind(pts, xs, W)
  const sp = sel != null ? pts[sel] : null
  const at = (c) => ({ left: `${(c.cx / W) * 100}%`, top: `${(c.top / H) * 100}%` })
  const yMid = (m.yLo + m.yHi) / 2
  // 겹친 보기에서 누른 날의 앱별 값
  const valueOn = (key, date) => (byPlatform?.[key] ?? []).find((p) => p.date === date)?.amount

  return (
    <figure className="hist" tabIndex={0} onKeyDown={onKey} onBlur={() => setSel(null)}
      aria-label={`할인 기록${sum ? `, 최고 ${won(sum.max)} 할인 ${md(sum.maxDate)}` : ''}. 좌우 화살표로 날짜 선택`}>
      {head}
      <div className="hist__bar">{plats}{ranges}</div>
      <div className="hist__wrap">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="hist__svg" aria-hidden="true" {...svgProps}>
          <defs>
            {m.lines.map((l) => (
              <linearGradient key={l.key} id={`${gid}-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={colorOf(l.key)} stopOpacity=".22" />
                <stop offset="1" stopColor={colorOf(l.key)} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {[[m.yHi, m.hi], [yMid, Math.round((m.hi + m.lo) / 2)], [m.yLo, m.lo]].map(([y, v]) => (
            <g key={y}><line x1={28} y1={y} x2={W} y2={y} className="hist__grid" /><text x={22} y={y} className="hist__ytick">{num(v)}</text></g>
          ))}
          {m.lines.map((l) => l.area.map((d, i) => <path key={`a${l.key}${i}`} d={d} fill={`url(#${gid}-${l.key})`} stroke="none" />))}
          {m.lines.map((l) => (
            <g key={l.key} stroke={colorOf(l.key)}>
              {l.solid.map((d, i) => <path key={`s${i}`} d={d} className="hist__solid" />)}
              {l.carried.map((d, i) => <path key={`c${i}`} d={d} className="hist__solid hist__carried" />)}
            </g>
          ))}
          {xTicks.map(([i, anchor]) => (
            <text key={anchor} x={xs[i]} y={H - 4} textAnchor={anchor} className="hist__xtick">{md(pts[i].date)}</text>
          ))}
          {sel == null && pills.map((c) => (
            <line key={`g${c.i}`} x1={xs[c.i]} y1={c.top + PILL_H} x2={xs[c.i]} y2={xy[c.i].y} className="hist__guide" />
          ))}
          {(sel == null ? pills.map((c) => c.i) : xy[sel].y == null ? [] : [sel]).map((i) => (
            <circle key={i} cx={xs[i]} cy={xy[i].y} r="3.5" className="hist__dot" />
          ))}
          {sel != null && <line x1={xs[sel]} y1={TOP - 6} x2={xs[sel]} y2={xy[sel].y ?? H - BOTTOM} className="hist__guide" />}
        </svg>
        {sel == null && pills.map((c) => (
          <div key={c.i} className="hist__tip" style={at(c)}>
            <span className="hist__tip-d">{md(pts[c.i].date)}</span>
            <b>{won(pts[c.i].amount)} 할인</b>
          </div>
        ))}
        {sp && (() => {
          const c = placeCallout(xy.map((p) => ({ ...p, y: p.y ?? m.yLo })), sel)
          return (
            <div className="hist__tip" role="status" style={at(c)}>
              <span className="hist__tip-d">{md(sp.date)}{sp.line === 'carried' && ' 기록 없음'}</span>
              <b>{sp.amount == null ? '할인 없음' : `${won(sp.amount)} 할인`}</b>
            </div>
          )
        })()}
      </div>
      {!platform && byPlatform && (
        <ul className="hist__legend">
          {m.lines.map((l) => {
            const v = sp ? valueOn(l.key, sp.date) : null
            return <li key={l.key} style={{ '--c': colorOf(l.key) }}>{SHORT_LABEL[l.key]}{sp && <b>{v == null ? '없음' : won(v)}</b>}</li>
          })}
        </ul>
      )}
    </figure>
  )
}
