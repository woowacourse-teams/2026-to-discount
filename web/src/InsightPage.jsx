// /insight 할인 통계 페이지(이슈 #403 1단계: A 오늘, B 추이, C 브랜드×앱, D 방식·기간·변동, F 데이터 범위).
// 홈 번들과 따로 도는 두 번째 입력(web/insight/index.html)이다. 홈의 실험, 분석, SSR을 싣지 않는다.
// 데이터는 GET /api/insight 하나. 실패하면 스켈레톤 뒤 한 줄 안내로 끝난다.
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveApiBase } from './apiBase.js'
import { APPS, COLOR, HEAT_STEPS, RANGES, SHORT, availableMetrics, heatLevel, md, metricPoints, plotLines, rangeStats, shareRows, sliceByRange, weekly } from './insightModel.js'
import './styles/insight.css'

const API_BASE = resolveApiBase(import.meta.env?.VITE_API_BASE_URL, import.meta.env?.VITE_APP_ENV)
const num = (n) => n.toLocaleString('ko-KR')
const won = (n) => `${num(n)}원`
const pct = (s) => `${Math.round(s * 100)}%`
const chun = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}천` : num(n))

function Tabs({ value, options, onChange, label }) {
  return (
    <div className="ins-tabs" role="group" aria-label={label}>
      {options.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{text}</button>
      ))}
    </div>
  )
}

function Card({ title, wide, children, extra }) {
  return (
    <section className={`ins-card${wide ? ' ins-card--wide' : ''}`}>
      <div className="ins-card__head"><h2>{title}</h2>{extra}</div>
      {children}
    </section>
  )
}

function Today({ today, apps, all }) {
  const top = (today.top ?? []).filter((t) => apps.includes(t.platform)).slice(0, 3)
  return (
    <Card title={`오늘${today.date ? " " + md(today.date) : ""}`} wide>
      <div className="ins-tiles">
        {apps.map((a) => (
          <div key={a} className="ins-tile" style={{ '--c': COLOR[a] }}>
            <span>{SHORT[a]} 할인 브랜드</span>
            <b>{today.activeBrands?.[a] ?? ''}</b>
          </div>
        ))}
        {all && today.newThisWeek != null && <div className="ins-tile"><span>이번 주 새 할인</span><b>{today.newThisWeek}</b></div>}
        {all && today.endingSoon != null && <div className="ins-tile"><span>7일 안에 끝남</span><b>{today.endingSoon}</b></div>}
      </div>
      {top.length > 0 && (
        <ol className="ins-top">
          {top.map((t) => (
            <li key={`${t.brand}-${t.platform}`}><span>{t.brand}</span><em style={{ color: COLOR[t.platform] }}>{SHORT[t.platform]}</em><b>{won(t.amount)}</b></li>
          ))}
        </ol>
      )}
    </Card>
  )
}

// 날짜별 지표(2026-11-19 사용자). 기간은 머리의 버튼이 정하고, 지표는 카드 안 탭으로 고른다.
// 그래프를 누르거나 끌면 그날 앱별 값을 보이고, 아래 표에 날짜×앱 값을 모두 적는다.
const fmt = (metric, v) => (v == null ? '–' : metric.unit === '원' ? won(v) : `${num(v)}${metric.unit}`)
const axis = (metric, v) => (metric.unit === '원' ? chun(v) : num(v))

function Daily({ days, apps, range }) {
  const metrics = availableMetrics(days)
  const [key, setKey] = useState('active')
  const [sel, setSel] = useState(null)
  const svgRef = useRef(null)
  const metric = metrics.find((m) => m.key === key) ?? metrics[0]
  const shown = sliceByRange(days, range)
  const appKey = apps.join()
  useEffect(() => { setSel(null) }, [range, key, appKey])
  if (!metric || shown.length < 2) return <Card title="날짜별 지표" wide><p className="ins-empty">표본 부족</p></Card>
  const W = 360
  const H = 200
  const series = apps.map((a) => ({ key: a, points: metricPoints(shown, a, metric.key) }))
  const m = plotLines(series, { w: W, h: H, left: 40, top: 14, bottom: 22, step: metric.unit === '원' ? null : 10 })
  const pick = (e) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !m) return
    const x = ((e.clientX - r.left) / r.width) * W
    let best = 0
    shown.forEach((_, k) => { if (Math.abs(m.x(k) - x) < Math.abs(m.x(best) - x)) best = k })
    setSel(best)
  }
  const mid = m ? Math.round((m.lo + m.hi) / 2) : 0
  const yMid = m ? (m.yLo + m.yHi) / 2 : 0
  const ticks = [0, Math.floor((shown.length - 1) / 2), shown.length - 1]
  const i = sel ?? shown.length - 1
  return (
    <Card title="날짜별 지표" wide extra={<Tabs label="지표" value={metric.key} onChange={setKey} options={metrics.map((x) => [x.key, x.label])} />}>
      <div className="ins-stats">
        {series.map(({ key: a, points }) => {
          const s = rangeStats(points)
          return (
            <div key={a} className="ins-stat" style={{ '--c': COLOR[a] }}>
              <span>{SHORT[a]}</span>
              <b>{fmt(metric, s?.last)}</b>
              {s && <small>평균 {fmt(metric, s.avg)} · 최고 {fmt(metric, s.max)}({md(s.maxDate)}) · {s.delta >= 0 ? '+' : ''}{axis(metric, s.delta)}</small>}
            </div>
          )
        })}
      </div>
      {m ? (
        <div className="ins-chart">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="ins-svg ins-svg--touch" role="img" aria-label={`${metric.label} 앱별 추이`}
            onPointerDown={pick} onPointerMove={(e) => { if (e.buttons || e.pointerType === 'mouse') pick(e) }}>
            {[[m.yHi, m.hi], [yMid, mid], [m.yLo, m.lo]].map(([y, v]) => (
              <g key={y}><line x1={40} x2={W} y1={y} y2={y} className="ins-gridline" /><text x={34} y={y} className="ins-ytick">{axis(metric, v)}</text></g>
            ))}
            {ticks.map((t, k) => (
              <text key={k} x={m.x(t)} y={H - 6} textAnchor={['start', 'middle', 'end'][k]} className="ins-xtick">{md(shown[t].date)}</text>
            ))}
            <line x1={m.x(i)} x2={m.x(i)} y1={m.yHi} y2={m.yLo} className="ins-guide" />
            {m.lines.map((l) => (
              <g key={l.key} stroke={COLOR[l.key]}>
                {l.solid.map((d, k) => <path key={`s${k}`} d={d} className="ins-line" />)}
                {l.carried.map((d, k) => <path key={`c${k}`} d={d} className="ins-line ins-line--carried" />)}
                {l.xy[i]?.y != null && <circle cx={l.xy[i].x} cy={l.xy[i].y} r={3.5} fill={COLOR[l.key]} stroke="var(--surface)" strokeWidth={1.5} />}
              </g>
            ))}
          </svg>
          <div className="ins-tip" role="status">
            <b>{md(shown[i].date)}</b>
            {series.map(({ key: a, points }) => <span key={a} style={{ '--c': COLOR[a] }}>{SHORT[a]} {fmt(metric, points[i].amount)}</span>)}
          </div>
        </div>
      ) : <p className="ins-empty">표본 부족</p>}
      <details className="ins-table">
        <summary>날짜별 표 보기</summary>
        <div className="ins-table__scroll">
          <table>
            <thead><tr><th>날짜</th>{apps.map((a) => <th key={a}>{SHORT[a]}</th>)}</tr></thead>
            <tbody>
              {[...shown].reverse().map((d) => (
                <tr key={d.date}><td>{md(d.date)}</td>{apps.map((a) => <td key={a}>{fmt(metric, metricPoints([d], a, metric.key)[0].amount)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  )
}

function HeatCell({ cell, label }) {
  const lv = heatLevel(cell)
  return <span className={`ins-heat ins-heat--${lv ?? 'none'}${cell?.carried ? ' ins-heat--carried' : ''}`} title={label}>{label && lv != null ? chun(cell.max) : ''}</span>
}

function Heatmap({ heatmap, apps, one }) {
  const weeks = heatmap.weeks ?? []
  const last = weeks.length - 1
  const rows = (heatmap.rows ?? []).filter((r) => apps.some((a) => r.cells?.[a]?.some((c) => c != null)))
  return (
    <Card title={one ? `${SHORT[one]} 브랜드별 주간 최고 할인` : '브랜드별 이번 주 최고 할인'} wide>
      <div className={`ins-heatmap${one ? ' ins-heatmap--weeks' : ''}`} style={{ '--cols': one ? weeks.length : apps.length }}>
        <span />
        {one
          ? weeks.map((w, i) => <span key={w} className="ins-heat__h">{i % 4 === 0 ? md(w) : ''}</span>)
          : apps.map((a) => <span key={a} className="ins-heat__h">{SHORT[a]}</span>)}
        {rows.map((r) => [
          <span key={r.brand} className="ins-heat__brand">{r.brand}</span>,
          ...(one
            ? weeks.map((w, i) => <HeatCell key={`${r.brand}${w}`} cell={r.cells?.[one]?.[i]} />)
            : apps.map((a) => <HeatCell key={`${r.brand}${a}`} cell={r.cells?.[a]?.[last]} label={r.cells?.[a]?.[last] ? `${SHORT[a]} ${r.brand}` : ''} />)),
        ])}
      </div>
      <ul className="ins-legend ins-legend--heat">
        <li><span className="ins-heat ins-heat--0" />0</li>
        {[...HEAT_STEPS, null].map((s, i) => (
          <li key={i}><span className={`ins-heat ins-heat--${i + 1}`} />{s ? `~${chun(s)}` : `${chun(HEAT_STEPS.at(-1))}+`}</li>
        ))}
        <li><span className="ins-heat ins-heat--1 ins-heat--carried" />빈 주 이어 씀</li>
      </ul>
    </Card>
  )
}

function Movers({ movers, apps }) {
  const list = (xs) => (xs ?? []).filter((x) => apps.includes(x.platform)).slice(0, 5)
  const block = (title, xs) => (
    <div>
      <h3 className="ins-sub">{title}</h3>
      {xs.length ? (
        <ul className="ins-movers">
          {xs.map((x) => (
            <li key={`${x.brand}-${x.platform}`}>
              <span>{x.brand}</span><em style={{ color: COLOR[x.platform] }}>{SHORT[x.platform]}</em>
              <b>{x.from != null && num(x.from)} → {x.to != null && num(x.to)}</b>
            </li>
          ))}
        </ul>
      ) : <p className="ins-empty">변동 없음</p>}
    </div>
  )
  return <Card title="지난 7일 변동">{block('오른 할인', list(movers?.up))}{block('내린 할인', list(movers?.down))}</Card>
}

function Compare({ compare, one }) {
  const block = (title, b) => {
    const rows = shareRows(b)
    return (
      <div>
        <h3 className="ins-sub">{title}</h3>
        {rows ? rows.map((r) => (
          <div key={r.app} className={`ins-bar${one && one !== r.app ? ' ins-bar--dim' : ''}`}>
            <span>{SHORT[r.app]}</span>
            <i><s style={{ width: pct(r.share), background: COLOR[r.app] }} /></i>
            <b>{pct(r.share)}</b>
          </div>
        )) : <p className="ins-empty">표본 부족</p>}
      </div>
    )
  }
  return (
    <Card title="같은 브랜드, 더 크게 보인 날의 비율">
      {block('빈 날 이어 쓴 값 포함', compare?.withCarried)}
      {block('그날 본 값만', compare?.observedOnly)}
    </Card>
  )
}

function Offers({ offers, apps }) {
  const kinds = [['coupon', '쿠폰'], ['membership', '멤버십'], ['tiers', '구간 할인'], ['pickup', '포장']]
  const rem = offers?.remainingDays ?? {}
  const remKeys = [['0-3', '3일 안'], ['4-7', '4~7일'], ['8-14', '8~14일'], ['15-30', '15~30일'], ['31+', '31일+'], ['unknown', '날짜 없음']]
  const remMax = Math.max(1, ...remKeys.map(([k]) => rem[k] ?? 0))
  return (
    <Card title="할인 방식과 남은 기간">
      {apps.map((a) => {
        const p = offers?.byPlatform?.[a]
        if (!p?.n) return null
        return (
          <div key={a} className="ins-kind">
            <h3 className="ins-sub">{SHORT[a]} {p.n}건</h3>
            {kinds.map(([k, label]) => (
              <div key={k} className="ins-bar">
                <span>{label}</span>
                <i><s style={{ width: pct((p[k] ?? 0) / p.n), background: COLOR[a] }} /></i>
                <b>{p[k] ?? 0}</b>
              </div>
            ))}
          </div>
        )
      })}
      <h3 className="ins-sub">남은 기간(전체 {offers?.total ?? ''}건)</h3>
      {remKeys.map(([k, label]) => (
        <div key={k} className="ins-bar">
          <span>{label}</span>
          <i><s style={{ width: pct((rem[k] ?? 0) / remMax) }} /></i>
          <b>{rem[k] ?? 0}</b>
        </div>
      ))}
    </Card>
  )
}

function Changes({ changes, apps, range }) {
  const all = changes?.weeks ?? []
  const from = all.length - sliceByRange(all, range).length
  const weeks = all.slice(from)
  const rows = [['started', '새 할인'], ['ended', '끝난 할인'], ['amountChanged', '금액 바뀜']]
    .map(([k, label]) => [label, weekly(changes?.[k], apps, all.length).slice(from)])
  const max = Math.max(1, ...rows.flatMap(([, v]) => v))
  if (!weeks.length) return null
  return (
    <Card title="주간 변동">
      {rows.map(([label, v]) => (
        <div key={label} className="ins-band ins-band--tall">
          <span>{label}</span>
          <svg viewBox={`0 0 ${weeks.length} 30`} preserveAspectRatio="none" aria-hidden="true">
            {v.map((n, i) => <rect key={i} x={i + 0.1} width={0.8} y={30 - (n / max) * 30} height={(n / max) * 30} />)}
          </svg>
          <b>{v.at(-1)}</b>
        </div>
      ))}
      <p className="ins-axis"><span>{md(weeks[0])}</span><span>{md(weeks.at(-1))}</span></p>
    </Card>
  )
}

const STATE = [['published', '할인 기록'], ['absent', '할인 없음'], ['withheld', '보류'], ['uncollected', '못 본 날'], ['unknown', '기록 없는 날']]

function Coverage({ coverage, apps }) {
  const days = coverage?.days ?? []
  const counts = coverage?.stateCounts ?? {}
  return (
    <Card title="데이터 범위" wide>
      {days.length > 0 && (
        <>
          {apps.map((a) => (
            <div key={a} className="ins-band">
              <span>{SHORT[a]}</span>
              <svg viewBox={`0 0 ${days.length} 10`} preserveAspectRatio="none" aria-hidden="true">
                <rect width={days.length} height={10} className="ins-cover__off" />
                {days.map((d, i) => d.platforms?.includes(a) && <rect key={i} x={i} width={1} height={10} fill={COLOR[a]} />)}
              </svg>
              <b>{days.filter((d) => d.platforms?.includes(a)).length}일</b>
            </div>
          ))}
          <p className="ins-axis"><span>{md(days[0].date)}</span><span>{md(days.at(-1).date)}</span></p>
        </>
      )}
      <dl className="ins-states">
        {STATE.filter(([k]) => counts[k] != null).map(([k, label]) => (
          <div key={k}><dt>{label}</dt><dd>{num(counts[k])}</dd></div>
        ))}
      </dl>
      {coverage?.conditions && <p className="ins-note">{coverage.conditions}</p>}
    </Card>
  )
}

function Skeleton() {
  return (
    <div className="ins-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <div key={i} className={`ins-card ins-skel${i === 0 ? ' ins-card--wide' : ''}`} />)}
    </div>
  )
}

export default function InsightPage() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [app, setApp] = useState('all')
  const [range, setRange] = useState('1m')
  useEffect(() => {
    fetch(`${API_BASE}/api/insight`, { signal: AbortSignal.timeout?.(10000) })
      .then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json() })
      .then((d) => { if (!d?.today || !d?.trend) throw new Error('insight 모양이 다르다'); setData(d) })
      .catch(() => setFailed(true))
  }, [])
  const known = (data?.platforms ?? APPS).filter((a) => SHORT[a])
  const apps = app === 'all' ? known : [app]
  const one = app === 'all' ? null : app
  const updated = data?.generatedAt ? `${md(data.generatedAt.slice(0, 10))} ${data.generatedAt.slice(11, 16)} 기준` : ''
  return (
    <main className="ins">
      <header className="ins-head">
        <a href="/" className="ins-home">SaveEats</a>
        <h1>할인 통계</h1>
        <span className="ins-updated">{updated}</span>
      </header>
      <nav className="ins-filter">
        <Tabs label="앱" value={app} onChange={setApp} options={[['all', '전체'], ...known.map((a) => [a, SHORT[a]])]} />
        <Tabs label="조회 기간" value={range} onChange={setRange} options={RANGES.map(([k, label]) => [k, label])} />
      </nav>
      {failed ? <p className="ins-fail" role="status">할인 통계를 못 불러옴</p>
        : !data ? <Skeleton /> : (
          <>
            <div className="ins-grid">
              <Today today={data.today} apps={apps} all={!one} />
              <Daily days={data.trend.days ?? []} apps={apps} range={range} />
              <Compare compare={data.compare} one={one} />
              <Movers movers={data.heatmap?.movers} apps={apps} />
              <Heatmap heatmap={data.heatmap ?? {}} apps={apps} one={one} />
            </div>
            <details className="ins-more">
              <summary>분석 보기</summary>
              <div className="ins-grid">
                <Offers offers={data.offers} apps={apps} />
                <Changes changes={data.changes} apps={apps} range={range} />
                <Coverage coverage={data.coverage} apps={apps} />
              </div>
            </details>
          </>
        )}
    </main>
  )
}

const root = typeof document !== 'undefined' && document.getElementById('insight-root')
if (root) createRoot(root).render(<StrictMode><InsightPage /></StrictMode>)
