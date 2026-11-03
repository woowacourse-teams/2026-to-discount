import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBrands, fetchBanners } from '../../api.js'
import { CATEGORIES } from '../../filters.js'
import { setHubLinks, openWithNotice } from '../../offerLink.js'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { toRows, ago } from './data.js'
import './scan-compare.css'

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))

function Go({ href, className = '' }) {
  return (
    <a
      className={`sc-go ${className}`}
      href={href}
      target={href?.startsWith('https://') ? '_blank' : undefined}
      rel="noopener noreferrer"
      onClick={(e) => { e.stopPropagation(); openWithNotice(e, href, { offerPrompt: true }) }}
    >
      받으러 가기
    </a>
  )
}

function Cell({ cell }) {
  if (cell.state === 'none') {
    return (
      <li className="sc-cell sc-cell--none">
        <PlatformBadge platformKey={cell.platform} />
        <span className="sc-cell__name">{cell.label}</span>
        <span className="sc-cell__dash" aria-label="오퍼 없음">-</span>
      </li>
    )
  }
  return (
    <li className={`sc-cell${cell.isBest ? ' sc-cell--best' : ''}`}>
      <div className="sc-cell__head">
        <PlatformBadge platformKey={cell.platform} />
        <span className="sc-cell__name">{cell.label}</span>
        {cell.isBest && <span className="sc-cell__best">최고</span>}
      </div>
      <strong className="sc-cell__amount">{cell.amount}</strong>
      <span className="sc-cell__min">{cell.min}</span>
      {cell.chips.length > 0 && (
        <span className="sc-chips">{cell.chips.map((c) => <em key={c} className="sc-chip">{c}</em>)}</span>
      )}
      <Go href={cell.href} />
    </li>
  )
}

function Row({ row, open, onToggle, now }) {
  const time = ago(row.capturedAt, now)
  return (
    <li className={`sc-row${open ? ' sc-row--open' : ''}`}>
      <div className="sc-row__bar">
        <button type="button" className="sc-row__main" aria-expanded={open} onClick={onToggle}>
          <BrandLogo name={row.name} size={40} />
          <span className="sc-row__body">
            <span className="sc-row__name">{row.name}</span>
            <span className="sc-row__sub">
              {row.bestPlatformLabel} · {row.bestMin}
              {row.bestChips.map((c) => <em key={c} className="sc-chip">{c}</em>)}
            </span>
          </span>
          <span className="sc-row__price">
            <strong className="sc-row__amount">{row.bestAmountText}</strong>
            {time && <span className="sc-row__time">{time}</span>}
          </span>
        </button>
        <Go href={row.bestHref} className="sc-go--row" />
      </div>
      {open && (
        <ul className="sc-grid">
          {row.cells.map((cell) => <Cell key={cell.platform} cell={cell} />)}
        </ul>
      )}
    </li>
  )
}

function Skeleton() {
  return (
    <ul className="sc-list" aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: 8 }, (_, i) => <li key={i} className="sc-row sc-row--skeleton" />)}
    </ul>
  )
}

export default function ScanCompareShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [openName, setOpenName] = useState(null)
  const [category, setCategory] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    setFailed(false)
    setBrands(null)
    // 허브 링크는 offerLink 사다리의 일부다. 배너를 못 받아도 목록은 그린다.
    const banners = fetchBanners().then((b) => { setHubLinks(b) }).catch(() => {})
    Promise.all([fetchBrands(), banners])
      .then(([b]) => { setBrands(b); setNow(Date.now()) })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => (brands ? toRows(brands) : []), [brands])
  const shown = category ? rows.filter((r) => r.category === category) : rows

  return (
    <main className="sc">
      <header className="sc-head">
        <h1 className="sc-title">배달앱 쿠폰 모아보기</h1>
        <div className="sc-cats" role="group" aria-label="분류">
          <button type="button" className={`sc-cat${category === null ? ' sc-cat--on' : ''}`} onClick={() => setCategory(null)}>전체</button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`sc-cat${category === c.key ? ' sc-cat--on' : ''}`}
              aria-pressed={category === c.key}
              onClick={() => { setCategory(category === c.key ? null : c.key); setOpenName(null) }}
            >
              {CATEGORY_LABEL[c.key]}
            </button>
          ))}
        </div>
      </header>
      {failed && (
        <div className="sc-fail" role="alert">
          <span>불러오지 못했어요</span>
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      )}
      {!failed && brands === null && <Skeleton />}
      {!failed && brands !== null && (
        <ul className="sc-list">
          {shown.map((row) => (
            <Row
              key={row.name}
              row={row}
              now={now}
              open={openName === row.name}
              onToggle={() => setOpenName(openName === row.name ? null : row.name)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
