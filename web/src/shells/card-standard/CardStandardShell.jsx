import { useEffect, useMemo, useState } from 'react'
import { visibleCategories } from '../../filters.js'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { loadHome, toCards } from './data.js'
import './card-standard.css'

function Card({ c }) {
  const web = c.href.startsWith('http')
  return (
    <article className="cs-card" data-brand={c.name}>
      <header className="cs-head">
        <BrandLogo name={c.name} size={40} />
        <h2 className="cs-name">{c.name}</h2>
        {c.popularRank != null && <span className="cs-rank">오늘 인기 {c.popularRank}위</span>}
      </header>
      <div className="cs-amount-row">
        <strong className="cs-amount">
          {c.soldOut ? <s>{c.amount}</s> : c.amount}
          {c.soldOut && <em className="cs-soldout">품절</em>}
        </strong>
        <PlatformBadge platformKey={c.platform} brand={c.name} />
      </div>
      {c.chips.length > 0 && (
        <ul className="cs-chips">
          {c.chips.map((b) => <li key={`${b.kind}:${b.text}`} className="cs-chip">{b.text}</li>)}
        </ul>
      )}
      <p className="cs-min">{c.minText}</p>
      <ul className="cs-cells">
        {c.cells.map((x) => (
          <li key={x.key} className={`cs-cell${x.on ? ' cs-cell--on' : ''}${x.empty ? ' cs-cell--empty' : ''}`}>
            <span className="cs-cell__app">{x.initial}</span>
            <span className="cs-cell__amt">{x.text}</span>
          </li>
        ))}
      </ul>
      <p className="cs-trust">
        <span>{c.capturedText}</span>
        {c.confirmed && <span className="cs-sure">확정</span>}
      </p>
      <a className="cs-go" href={c.href}
         target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
         aria-label={`${c.name} ${c.amount}, 앱으로 이동`}
         onClick={(e) => openWithNotice(e, c.href)}>
        받으러 가기
      </a>
    </article>
  )
}

export default function CardStandardShell() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    let alive = true
    setError(null)
    setData(null)
    loadHome()
      .then((v) => { if (alive) setData(v) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [reloadKey])

  const cards = useMemo(
    () => (data ? toCards(data.brands, { categories: selected }) : []),
    [data, selected],
  )
  const cats = useMemo(() => visibleCategories(data?.brands, selected), [data, selected])

  const toggle = (key) => setSelected((s) => (s.has(key) ? new Set() : new Set([key])))

  return (
    <main className="cs-page">
      <h1 className="cs-title">오늘의 배달앱 할인</h1>
      <div className="cs-cats" role="group" aria-label="분류">
        <button type="button" className={`cs-cat${selected.size === 0 ? ' cs-cat--on' : ''}`} onClick={() => setSelected(new Set())}>전체</button>
        {cats.map((c) => (
          <button key={c.key} type="button" className={`cs-cat${selected.has(c.key) ? ' cs-cat--on' : ''}`} onClick={() => toggle(c.key)}>{c.label}</button>
        ))}
      </div>
      {error && (
        <div className="cs-error">
          <p>할인을 불러오지 못했어요</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)}>다시 시도</button>
        </div>
      )}
      {!error && !data && [0, 1, 2].map((i) => <div key={i} className="cs-card cs-card--skeleton" aria-hidden="true" />)}
      {data && cards.map((c) => <Card key={c.name} c={c} />)}
    </main>
  )
}
