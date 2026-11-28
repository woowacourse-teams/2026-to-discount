import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchHistory } from '../../api.js'
import { won } from '../../OfferChip.jsx'
import HistoryPlatformChips from '../../HistoryPlatformChips.jsx'
import { APP_COLOR, PLATFORMS, SHORT_LABEL } from '../../platforms.js'
import { track } from '../../analytics.js'

// 기간: 2주는 API에 없어 1달을 받아 마지막 14일만 그린다(운영 BestHistoryChart와 같다).
const RANGES = [['2w', '2주'], ['1m', '1달'], ['all', '전체']]
const TWO_WEEKS_MS = 13 * 864e5
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const colorOf = (k) => APP_COLOR[k] ?? 'var(--sale)'
const MUTE = '#d1d6db'
const LABEL = { ...SHORT_LABEL, best: '최고' }

// 받은 이력은 이 브라우저 탭 안에서 브랜드별로 들고 있다. 카드를 누르는 순간 미리 받아 두면 탭을 열 때 바로 그린다.
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

// 묶인 버튼 줄에서 고른 칸 표시 하나가 미끄러져 간다(2026-11-28 사용자). 고른 칸 자리를 재어 CSS 변수로 넘긴다.
function useSlide() {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const a = el?.querySelector('[aria-pressed="true"]')
    if (!a) return
    for (const [k, v] of [['--x', a.offsetLeft], ['--y', a.offsetTop], ['--w', a.offsetWidth], ['--h', a.offsetHeight]]) el.style.setProperty(k, `${v}px`)
  })
  return ref
}

// 날짜별 한 줄로 합친다. 앱마다 본 날(k)과 못 본 날 점선(k~)을 따로 둔다.
// 점선은 이어지는 본 날 끝점까지 포함해 실선과 끊김 없이 붙는다(떠 있는 점선 조각이 생기지 않게).
export function rowsOf(series) {
  const byDate = new Map()
  const row = (d) => byDate.get(d) ?? byDate.set(d, { date: d }).get(d)
  for (const { key, points } of series) {
    points.forEach((p, i) => {
      if (p.amount == null) return
      const r = row(p.date)
      const carried = p.line === 'carried'
      if (!carried) r[key] = p.amount
      const nb = [points[i - 1], points[i + 1]].some((q) => q?.amount != null && q.line === 'carried')
      if (carried || nb) r[`${key}~`] = p.amount
    })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const lastOf = (rows, k) => { for (let i = rows.length - 1; i >= 0; i--) { const v = rows[i][k] ?? rows[i][`${k}~`]; if (v != null) return v } return null }

function Tip({ active, payload, label, keys }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  return (
    <div className="v2-hist__tip">
      <span>{md(label)}</span>
      {keys.map((k) => {
        const v = r[k] ?? r[`${k}~`]
        return v == null ? null : <b key={k} style={{ '--c': colorOf(k) }}>{LABEL[k]} {won(v)}{r[k] == null && <em> 기록 없음</em>}</b>
      })}
    </div>
  )
}

// 전체는 앱마다 곡선을 겹치되 지금 할인이 가장 큰 앱만 색, 나머지는 회색. 가리키거나 누른 앱으로 색이 옮겨 간다(2026-11-28 사용자).
export default function PriceChart({ brand }) {
  const [range, setRange] = useState('1m')
  const [platform, setPlatform] = useState(null) // null = 전체
  const [hover, setHover] = useState(null)
  const [pin, setPin] = useState(null)
  const [data, setData] = useState(null)
  const rangeRef = useSlide()
  const platRef = useSlide()
  const gid = useId().replace(/:/g, '')
  useEffect(() => {
    let live = true
    prefetchHistory(brand, range).then((d) => { if (live) setData(d) })
    return () => { live = false }
  }, [brand, range])

  const byPlatform = data?.byPlatform
  const best = data?.best ?? []
  const lastT = best.length ? Date.parse(best[best.length - 1].date) : 0
  const clip = (ps) => (range === '2w' ? ps.filter((p) => Date.parse(p.date) >= lastT - TWO_WEEKS_MS) : ps)
  const series = (platform
    ? [{ key: platform, points: clip(byPlatform?.[platform] ?? []) }]
    : byPlatform
      ? PLATFORMS.map(({ key }) => ({ key, points: clip(byPlatform[key] ?? []) }))
      : [{ key: 'best', points: clip(best) }]
  ).filter((s) => s.points.filter((p) => p.amount != null).length >= 2)
  const rows = rowsOf(series)
  const keys = series.map((s) => s.key)
  const lead = keys.reduce((a, k) => (a == null || (lastOf(rows, k) ?? -1) > (lastOf(rows, a) ?? -1) ? k : a), null)
  const hl = platform ?? hover ?? pin ?? lead
  const order = [...keys.filter((k) => k !== hl), ...keys.filter((k) => k === hl)]
  const cur = hl ? lastOf(rows, hl) : null

  const ranges = (
    <div className="v2-seg" role="group" aria-label="기간" ref={rangeRef}>
      {RANGES.map(([k, label]) => (
        <button key={k} type="button" className="v2-seg__btn" aria-pressed={range === k}
          onClick={() => { if (k !== range) track('history_range_change', { brand, from: range, to: k }); setRange(k) }}>{label}</button>
      ))}
    </div>
  )
  const plats = !byPlatform ? null : (
    <div ref={platRef} className="v2-seg v2-seg--plats"
      onMouseOver={(e) => { const k = e.target.closest('[data-k]')?.dataset.k; if (k) setHover(k) }} onMouseLeave={() => setHover(null)}>
      <HistoryPlatformChips value={platform} onChange={setPlatform} className="v2-seg__row" chipClassName="v2-seg__btn" />
    </div>
  )
  if (!rows.length) {
    if (platform) return <figure className="v2-hist">{plats}{ranges}{data && <p className="hist__empty">이 앱의 할인 기록이 아직 없어요</p>}</figure>
    return range === '1m' ? null : <figure className="v2-hist">{ranges}</figure>
  }

  return (
    <figure className="v2-hist" aria-label={`할인 기록${cur != null ? `, ${LABEL[hl]} 지금 ${won(cur)} 할인` : ''}`}>
      {plats}
      {ranges}
      {cur != null && (
        <p className="v2-hist__now" style={{ '--c': colorOf(hl) }}>
          <span>{LABEL[hl]} 지금</span><b>{won(cur)} 할인</b>
        </p>
      )}
      <div className="v2-hist__chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
            <defs>
              {keys.map((k) => (
                <linearGradient key={k} id={`${gid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={colorOf(k)} stopOpacity={0.28} />
                  <stop offset="1" stopColor={colorOf(k)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="#eef0f3" />
            <XAxis dataKey="date" tickFormatter={md} tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 12, fill: '#8b95a1' }} />
            <YAxis width={44} tickLine={false} axisLine={false} tickCount={4} domain={[0, 'auto']}
              tickFormatter={(v) => (v >= 1000 ? `${v / 1000}천` : v)} tick={{ fontSize: 12, fill: '#8b95a1' }} />
            <Tooltip content={<Tip keys={keys} />} cursor={{ stroke: '#c9ced6', strokeDasharray: '3 3' }} />
            {order.map((k) => {
              const on = k === hl
              const c = on ? colorOf(k) : MUTE
              return [
                on && <Area key={`a${k}`} dataKey={k} type="monotoneX" stroke="none" fill={`url(#${gid}-${k})`} connectNulls={false} isAnimationActive={false} activeDot={false} />,
                <Line key={`s${k}`} dataKey={k} type="monotoneX" stroke={c} strokeWidth={on ? 2.6 : 1.6} dot={false}
                  activeDot={on ? { r: 4, strokeWidth: 2, stroke: '#fff', fill: c } : false} connectNulls={false} animationDuration={400} />,
                <Line key={`c${k}`} dataKey={`${k}~`} type="monotoneX" stroke={c} strokeWidth={on ? 2 : 1.4} strokeDasharray="4 4" dot={false}
                  activeDot={false} connectNulls={false} legendType="none" animationDuration={400} />,
              ]
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!platform && keys.length > 1 && (
        <ul className="v2-hist__legend">
          {keys.map((k) => (
            <li key={k} style={{ '--c': k === hl ? colorOf(k) : MUTE }} aria-current={k === hl || undefined}>
              <button type="button" onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}
                onClick={() => setPin((o) => (o === k ? null : k))}>{LABEL[k]}</button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
