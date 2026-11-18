// /insight 할인 통계 페이지(이슈 #403 1단계: A 오늘, B 추이, C 브랜드×앱, D 방식·기간·변동, F 데이터 범위).
// 홈 번들과 따로 도는 두 번째 입력(web/insight/index.html)이다. 홈의 실험, 분석, SSR을 싣지 않는다.
// 데이터는 GET /api/insight 하나. 실패하면 스켈레톤 뒤 한 줄 안내로 끝난다.
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveApiBase } from './apiBase.js'
import { APPS, COLOR, HEAT_STEPS, SHORT, heatLevel, md, plotLines, shareRows, trendPoints, weekly } from './insightModel.js'
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

function Trend({ trend, apps }) {
  const [mode, setMode] = useState('won')
  const days = trend.days ?? []
  const W = 320
  const H = 160
  const m = days.length > 1 ? plotLines(apps.map((a) => ({ key: a, points: trendPoints(days, a, mode) })), { w: W, h: H }) : null
  const mid = Math.floor((days.length - 1) / 2)
  const maxActive = Math.max(1, ...days.flatMap((d) => apps.map((a) => d.active?.[a] ?? 0)))
  const last = days[days.length - 1]
  return (
    <Card title="앱별 할인 추이" extra={<Tabs label="단위" value={mode} onChange={setMode} options={[['won', '원'], ['index', '9/1=100']]} />}>
      {m ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="ins-svg" role="img" aria-label="앱별 할인액 중앙값 추이">
          <line x1={30} x2={W} y1={m.yHi} y2={m.yHi} className="ins-gridline" />
          <line x1={30} x2={W} y1={m.yLo} y2={m.yLo} className="ins-gridline" />
          <text x={26} y={m.yHi} className="ins-ytick">{mode === 'won' ? chun(m.hi) : m.hi}</text>
          <text x={26} y={m.yLo} className="ins-ytick">{mode === 'won' ? chun(m.lo) : m.lo}</text>
          {[[0, 'start'], [mid, 'middle'], [days.length - 1, 'end']].map(([i, anchor]) => (
            <text key={anchor} x={m.x(i)} y={H - 4} textAnchor={anchor} className="ins-xtick">{md(days[i].date)}</text>
          ))}
          {m.lines.map((l) => (
            <g key={l.key} stroke={COLOR[l.key]}>
              {l.solid.map((d, i) => <path key={`s${i}`} d={d} className="ins-line" />)}
              {l.carried.map((d, i) => <path key={`c${i}`} d={d} className="ins-line ins-line--carried" />)}
            </g>
          ))}
        </svg>
      ) : <p className="ins-empty">표본 부족</p>}
      <ul className="ins-legend">
        {apps.map((a) => <li key={a} style={{ '--c': COLOR[a] }}>{SHORT[a]}</li>)}
        <li className="ins-legend__dash">빈 날 이어 그림</li>
      </ul>
      <h3 className="ins-sub">할인 중 브랜드 수</h3>
      {apps.map((a) => (
        <div key={a} className="ins-band">
          <span>{SHORT[a]}</span>
          <svg viewBox={`0 0 ${days.length} 20`} preserveAspectRatio="none" aria-hidden="true">
            {days.map((d, i) => d.active?.[a] != null && (
              <rect key={i} x={i} width={0.8} y={20 - (d.active[a] / maxActive) * 20} height={(d.active[a] / maxActive) * 20} fill={COLOR[a]} />
            ))}
          </svg>
          <b>{last?.active?.[a] ?? ''}</b>
        </div>
      ))}
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

function Changes({ changes, apps }) {
  const weeks = changes?.weeks ?? []
  const rows = [['started', '새 할인'], ['ended', '끝난 할인'], ['amountChanged', '금액 바뀜']]
    .map(([k, label]) => [label, weekly(changes?.[k], apps, weeks.length)])
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
      </nav>
      {failed ? <p className="ins-fail" role="status">할인 통계를 못 불러옴</p>
        : !data ? <Skeleton /> : (
          <>
            <div className="ins-grid">
              <Today today={data.today} apps={apps} all={!one} />
              <Trend trend={data.trend} apps={apps} />
              <Compare compare={data.compare} one={one} />
              <Movers movers={data.heatmap?.movers} apps={apps} />
              <Heatmap heatmap={data.heatmap ?? {}} apps={apps} one={one} />
            </div>
            <details className="ins-more">
              <summary>분석 보기</summary>
              <div className="ins-grid">
                <Offers offers={data.offers} apps={apps} />
                <Changes changes={data.changes} apps={apps} />
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
