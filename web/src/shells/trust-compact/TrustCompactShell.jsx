import { useEffect, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { ago, loadHome, toneOf } from './data.js'
import './trust-compact.css'

function Row({ row }) {
  const when = ago(row.capturedAt)
  return (
    <a className="tc-row" href={row.href} onClick={(e) => openWithNotice(e, row.href)}>
      <BrandLogo name={row.name} size={36} />
      <span className="tc-main">
        <span className="tc-line1">
          <span className="tc-name">{row.name}</span>
          <span className="tc-amount">{row.amount}</span>
        </span>
        <span className="tc-line2">
          <span className="tc-app">{row.platformLabel}</span>
          <span className="tc-min">{row.min}</span>
          {row.extraApps > 0 && <span className="tc-extra">+{row.extraApps}</span>}
          {row.chips.map((c) => <span key={`${c.kind}-${c.text}`} className="tc-chip">{c.text}</span>)}
        </span>
        <span className="tc-line3">
          <span className={`tc-dot tc-dot--${toneOf(row.capturedAt)}`} aria-hidden="true" />
          {when && <span className="tc-ago">{when}</span>}
          {row.trustChips.map((c) => <span key={c.text} className="tc-chip tc-chip--warn">{c.text}</span>)}
        </span>
      </span>
      <span className="tc-go" aria-hidden="true">›</span>
    </a>
  )
}

export default function TrustCompactShell() {
  const [home, setHome] = useState(null)
  const [failed, setFailed] = useState(false)
  const [category, setCategory] = useState(null)

  useEffect(() => {
    let alive = true
    loadHome().then((h) => { if (alive) setHome(h) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const rows = home ? home.rows.filter((r) => category == null || r.category === category) : []
  const updated = home ? ago(home.updatedAt) : null

  return (
    <div className="tc-shell">
      <header className="tc-head">
        <h1 className="tc-title">배달앱 할인 모음</h1>
        {updated && <span className="tc-updated">마지막 갱신 {updated}</span>}
      </header>
      <nav className="tc-cats" aria-label="분류">
        <button type="button" className={`tc-cat${category == null ? ' is-on' : ''}`} onClick={() => setCategory(null)}>전체</button>
        {(home?.categories ?? []).map((c) => (
          <button key={c.key} type="button" className={`tc-cat${category === c.key ? ' is-on' : ''}`} onClick={() => setCategory(c.key)}>{c.label}</button>
        ))}
      </nav>
      {failed && <p className="tc-msg">불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
      {!home && !failed && <p className="tc-msg">불러오는 중</p>}
      <main className="tc-list">
        {rows.map((r) => <Row key={r.key} row={r} />)}
      </main>
    </div>
  )
}
