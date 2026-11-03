import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice, setHubLinks } from '../../offerLink.js'
import { COPY, popularAvailable, rankingRows, summaryOf } from './data.js'
import './ranking.css'

function Row({ r }) {
  const web = r.href?.startsWith('http')
  const body = (
    <>
      <span className={`rk-no${r.rank <= 3 ? ' rk-no--top' : ''}`}>{r.rank}</span>
      <span className="rk-main">
        <span className="rk-who"><BrandLogo name={r.brand.name} size={28} /><b>{r.brand.shortName ?? r.brand.name}</b></span>
        <span className="rk-track" aria-hidden="true"><i style={{ width: `${Math.max(r.bar, 2)}%` }} /></span>
      </span>
      <span className="rk-val">
        <strong>{r.label}</strong>
        <small>{r.app} · {r.min}</small>
      </span>
      {r.chips.length > 0 && <span className="rk-chips">{r.chips.map((c) => <em key={c}>{c}</em>)}</span>}
      <span className="rk-foot">
        <span>{r.capturedAt ? `${r.capturedAt} 기준` : ''}</span>
        {r.href && <span className="rk-go">{COPY.go}</span>}
      </span>
    </>
  )
  const cls = `rk-row${r.rank === 1 ? ' rk-row--first' : ''}`
  if (!r.href) return <li><div className={cls}>{body}</div></li>
  return (
    <li>
      <a className={cls} href={r.href} target={web ? '_blank' : undefined} rel={web ? 'noopener noreferrer' : undefined}
         aria-label={`${r.brand.name} ${r.label}, 앱으로 이동`} onClick={(e) => openWithNotice(e, r.href)}>
        {body}
      </a>
    </li>
  )
}

export default function RankingShell({ initial = null }) {
  const [brands, setBrands] = useState(initial?.brands ?? null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('amount')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (reload === 0 && initial?.brands) return undefined
    let alive = true
    setError(null)
    setBrands(null)
    fetchBrands().then((v) => { if (alive) setBrands(v) }).catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [reload])

  useEffect(() => {
    fetchBanners().then((got) => setHubLinks(got)).catch(() => {})
  }, [])

  const hasPopular = useMemo(() => (brands ? popularAvailable(brands) : false), [brands])
  const shown = tab === 'popular' && !hasPopular ? 'amount' : tab
  const rows = useMemo(() => (brands ? rankingRows(brands, shown) : []), [brands, shown])

  return (
    <main className="rk">
      <header className="rk-head">
        <h1>{COPY.title}</h1>
        {brands && <p>{summaryOf(brands)}</p>}
      </header>
      {hasPopular && (
        <div className="rk-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={shown === 'amount'} onClick={() => setTab('amount')}>{COPY.tabAmount}</button>
          <button type="button" role="tab" aria-selected={shown === 'popular'} onClick={() => setTab('popular')}>{COPY.tabPopular}</button>
        </div>
      )}
      {error && <p className="rk-msg">{COPY.failed} <button type="button" onClick={() => setReload((n) => n + 1)}>{COPY.retry}</button></p>}
      {!error && !brands && <p className="rk-msg">{COPY.loading}</p>}
      {brands && rows.length === 0 && <p className="rk-msg">{COPY.empty}</p>}
      <ol className="rk-list">{rows.map((r) => <Row key={r.brand.name} r={r} />)}</ol>
    </main>
  )
}
