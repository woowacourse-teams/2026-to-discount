import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { fetchHistory } from '../../api.js'
import { callouts, overlayModel, nearestIndex, placeCallout, summary, H, W, BOTTOM, PILL_H, TOP } from '../../historyChart.js'
import { won } from '../../OfferChip.jsx'
import HistoryPlatformChips from '../../HistoryPlatformChips.jsx'
import { APP_COLOR, PLATFORMS, SHORT_LABEL } from '../../platforms.js'
import { useChartScrub } from '../../useChartScrub.js'
import { track } from '../../analytics.js'
import '../../styles/hist.css'

// 기간: 앱 칩 줄 바로 밑 버튼 줄(캐러셀). 2주는 API에 없어 1달을 받아 마지막 14일만 그린다(운영 BestHistoryChart와 같다).
const RANGES = [['2w', '2주'], ['1m', '1달'], ['all', '전체']]
const TWO_WEEKS_MS = 13 * 864e5
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const num = (n) => n.toLocaleString('ko-KR')
const colorOf = (k) => APP_COLOR[k] ?? 'var(--sale)'
const MUTE = '#d1d6db'

// 묶인 버튼 줄에서 고른 칸 밑으로 판 하나가 미끄러져 간다(2026-11-28 사용자). 고른 칸 자리를 재어 --x, --w로 넘긴다.
function useSlide(dep) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const a = el?.querySelector('[aria-pressed="true"]')
    if (!a) return
    el.style.setProperty('--x', `${a.offsetLeft}px`)
    el.style.setProperty('--w', `${a.offsetWidth}px`)
    el.style.setProperty('--h', `${a.offsetHeight}px`)
    el.style.setProperty('--y', `${a.offsetTop}px`)
  })
  return ref
}

// 받은 이력은 이 브라우저 탭 안에서 브랜드별로 들고 있다. 카드를 누르는 순간(또는 팝업이 뜨는 순간) 미리 받아 두면 탭을 열 때 바로 그린다.
// 실패(null)는 들고 있지 않아 다음에 다시 받는다.
const historyCache = new Map()
export function prefetchHistory(brand, range = '1m') {
  const api = range === '2w' ? '1m' : range
  const key = `${brand}|${api}`
  if (!historyCache.has(key)) {
    historyCache.set(key, fetchHistory(brand, api).then((d) => { if (d == null) historyCache.delete(key); return d }))
  }
  return historyCache.get(key)
}

// 열릴 때만 받는다. 이력이 없거나 점이 둘 미만이면 아무것도 안 그린다(시트는 그대로).
// 전체는 앱마다 제 색 곡선과 옅은 그라데이션 면을 겹친다(2026-11-28 사용자: /insight 날짜별 지표처럼). 못 본 날은 점선.
export default function PriceChart({ brand }) {
  const [range, setRange] = useState('1m')
  const [platform, setPlatform] = useState(null) // null = 전체
  // 전체에서 색을 넣을 앱: 가리킨 앱 > 누른 앱 > 지금 할인이 가장 큰 앱. 나머지는 회색(2026-11-28 사용자).
  const [hover, setHover] = useState(null)
  const [pin, setPin] = useState(null)
  const rangeRef = useSlide()
  const platRef = useSlide()
  const [data, setData] = useState(null)
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const gid = useId().replace(/:/g, '')
  // 칸(탭 안 남는 자리) 크기. 이 크기 그대로 그려 칸을 꽉 채운다(글자는 늘어나지 않는다). 재기 전에는 기본 크기.
  const [size, setSize] = useState({ w: W, h: H })
  const { sel, setSel, bind } = useChartScrub(svgRef, data, brand, range)
  useEffect(() => {
    let live = true
    prefetchHistory(brand, range).then((d) => { if (live) { setData(d); setSel(null) } })
    return () => { live = false }
  }, [brand, range])
  const hasChart = data != null
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    // 레이아웃 크기(clientWidth, clientHeight)로 잰다. 시트가 뜨는 동안의 살짝 커지는 효과(transform)가 getBoundingClientRect 값을 줄여 놓기 때문이다.
    const set = () => { const w = el.clientWidth; const h = el.clientHeight; if (w > 0 && h > 0) setSize((o) => (o.w === w && o.h === h ? o : { w, h })) }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasChart])
  const byPlatform = data?.byPlatform
  const best = data?.best ?? []
  const lastT = best.length ? Date.parse(best[best.length - 1].date) : 0
  const clip = (ps) => (range === '2w' ? ps.filter((p) => Date.parse(p.date) >= lastT - TWO_WEEKS_MS) : ps)
  // 앱별 곡선이 없으면(옛 API) 전체 최고 한 줄
  const series = platform
    ? [{ key: platform, points: clip(byPlatform?.[platform] ?? []) }]
    : byPlatform
      ? PLATFORMS.map(({ key }) => ({ key, points: clip(byPlatform[key] ?? []) }))
      : [{ key: 'best', points: clip(best) }]
  // 값 표시와 누르기의 기준 줄: 고른 앱, 아니면 전체 최고
  const pts = platform ? series[0].points : clip(best)
  const { w: cw, h: ch } = size
  const m = overlayModel(series, cw, ch)
  const lastY = (l) => [...l.xy].reverse().find((p) => p.y != null)?.y ?? Infinity // y가 작을수록 큰 금액
  const lead = m?.lines.reduce((a, l) => (a == null || lastY(l) < lastY(a) ? l : a), null)?.key
  const hl = platform ?? hover ?? pin ?? lead
  const order = m ? [...m.lines.filter((l) => l.key !== hl), ...m.lines.filter((l) => l.key === hl)] : []
  const ranges = (
    <div className="v2-hist__ranges v2-seg" role="group" aria-label="기간" ref={rangeRef}>
      {RANGES.map(([k, label]) => (
        <button key={k} type="button" className="v2-hist__range" aria-pressed={range === k}
          onClick={() => { if (k !== range) track('history_range_change', { brand, from: range, to: k }); setSel(null); setRange(k) }}>{label}</button>
      ))}
    </div>
  )
  const plats = !byPlatform ? null : (
    <div ref={platRef} className="v2-seg v2-seg--plats"
      onMouseOver={(e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) setHover(k) }} onMouseLeave={() => setHover(null)}>
      <HistoryPlatformChips value={platform} onChange={(k) => { setSel(null); setPlatform(k) }} className="v2-hist__ranges v2-hist__plats" chipClassName="v2-hist__range" />
    </div>
  )
  if (!m || pts.filter((p) => p.amount != null).length < 2) {
    if (platform) return <figure className="hist v2-hist">{plats}{ranges}{data && <p className="hist__empty">이 앱의 할인 기록이 아직 없어요</p>}</figure>
    return range === '1m' ? null : <figure className="hist v2-hist">{ranges}</figure>
  }
  const sum = summary(pts)
  const xy = pts.map((p) => ({ x: m.x(p.date), y: p.amount == null ? null : m.y(p.amount) }))
  const xs = xy.map((p) => p.x)
  const pills = callouts(pts, xy, cw)
  const midI = nearestIndex((xs[0] + xs[xs.length - 1]) / 2, xs)
  const xTicks = [[0, 'start'], [midI, 'middle'], [pts.length - 1, 'end']]
  const { svgProps, onKey } = bind(pts, xs, cw)
  const sp = sel != null ? pts[sel] : null
  // 말풍선 대신 판 없는 값 표시(2026-10-14 사용자). 최고, 현재, 누른 점 모두 같은 모양과 자리 규칙이다.
  const at = (c) => ({ left: `${(c.cx / cw) * 100}%`, top: `${(c.top / ch) * 100}%` })
  const valueOn = (key, date) => (byPlatform?.[key] ?? []).find((p) => p.date === date)?.amount

  return (
    <figure className="hist v2-hist" tabIndex={0} onKeyDown={onKey} onBlur={() => setSel(null)}
      aria-label={`할인 기록${sum ? `, 최고 ${won(sum.max)} 할인 ${md(sum.maxDate)}` : ''}. 좌우 화살표로 날짜 선택`}>
      <div className="hist__head">
        <figcaption className="hist__title">할인 기록</figcaption>
      </div>
      {plats}
      {ranges}
      <div className="hist__wrap" ref={wrapRef}>
        <svg ref={svgRef} viewBox={`0 0 ${cw} ${ch}`} className="hist__svg" aria-hidden="true" {...svgProps}>
          <defs>
            {m.lines.map((l) => (
              <linearGradient key={l.key} id={`${gid}-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={colorOf(l.key)} stopOpacity=".22" />
                <stop offset="1" stopColor={colorOf(l.key)} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          <line x1={0} y1={m.yHi} x2={cw} y2={m.yHi} className="hist__grid" />
          <line x1={0} y1={m.yLo} x2={cw} y2={m.yLo} className="hist__grid" />
          <text x={0} y={m.yHi - 5} className="hist__ytick">{num(m.hi)}</text>
          <text x={0} y={m.yLo - 5} className="hist__ytick">{num(m.lo)}</text>
          {order.filter((l) => l.key === hl).map((l) => l.area.map((d, i) => <path key={`a${l.key}${i}`} d={d} fill={`url(#${gid}-${l.key})`} />))}
          {order.map((l) => (
            <g key={l.key} style={{ stroke: l.key === hl ? colorOf(l.key) : MUTE, transition: 'stroke .2s' }}>
              {l.solid.map((d, i) => <path key={`s${i}`} d={d} className="v2-hist__line" />)}
              {l.carried.map((d, i) => <path key={`c${i}`} d={d} className="v2-hist__line v2-hist__line--carried" />)}
            </g>
          ))}
          {xTicks.map(([i, anchor]) => (
            <text key={anchor} x={xs[i]} y={ch - 4} textAnchor={anchor} className="hist__xtick">{md(pts[i].date)}</text>
          ))}
          {sel == null && pills.map((c) => (
            <line key={`g${c.i}`} x1={xs[c.i]} y1={c.top + PILL_H} x2={xs[c.i]} y2={xy[c.i].y} className="hist__guide" />
          ))}
          {(sel == null ? pills.map((c) => c.i) : xy[sel].y == null ? [] : [sel]).map((i) => (
            <circle key={i} cx={xs[i]} cy={xy[i].y} r="3.5" className="hist__dot" />
          ))}
          {sel != null && <line x1={xs[sel]} y1={TOP - 6} x2={xs[sel]} y2={xy[sel].y ?? ch - BOTTOM} className="hist__guide" />}
        </svg>
        {sel == null && pills.map((c) => (
          <div key={c.i} className="hist__tip" style={at(c)}>
            <span className="hist__tip-d">{md(pts[c.i].date)}</span>
            <b>{won(pts[c.i].amount)} 할인</b>
          </div>
        ))}
        {sp && (() => {
          const c = placeCallout(xy.map((p) => ({ ...p, y: p.y ?? m.yLo })), sel, cw)
          return (
            <div className="hist__tip" role="status" style={at(c)}>
              <span className="hist__tip-d">{md(sp.date)}{sp.line === 'carried' && ' 기록 없음'}</span>
              <b>{sp.amount == null ? '할인 없음' : `${won(sp.amount)} 할인`}</b>
            </div>
          )
        })()}
      </div>
      {!platform && byPlatform && (
        <ul className="v2-hist__legend">
          {m.lines.map((l) => {
            const v = sp ? valueOn(l.key, sp.date) : null
            return (
              <li key={l.key} style={{ '--c': l.key === hl ? colorOf(l.key) : MUTE }} aria-current={l.key === hl || undefined}>
                <button type="button" onMouseEnter={() => setHover(l.key)} onMouseLeave={() => setHover(null)}
                  onClick={() => setPin((o) => (o === l.key ? null : l.key))}>{SHORT_LABEL[l.key]}{sp && <b>{v == null ? '없음' : won(v)}</b>}</button>
              </li>
            )
          })}
        </ul>
      )}
    </figure>
  )
}
