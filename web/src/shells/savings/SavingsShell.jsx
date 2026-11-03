import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { offerLink, openWithNotice, setHubLinks } from '../../offerLink.js'
import { BrandLogo } from '../../logos.jsx'
import { CATEGORIES, DEFAULT_ORDER_WON, capturedLabel, savingsRows } from './data.js'
import './savings.css'

const won = (n) => `${n.toLocaleString('ko-KR')}원`

function OfferButton({ cell, children, className }) {
  const href = offerLink(cell.offer, cell.brand.links, cell.brand.name)
  if (!href) return <span className={`sv-go sv-go--off ${className ?? ''}`}>{children}</span>
  return (
    <a className={`sv-go ${className ?? ''}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" onClick={(e) => openWithNotice(e, href)}>
      {children}
    </a>
  )
}

function AppCell({ cell }) {
  const label = cell.platform.label
  if (cell.state === 'none') return <li className="sv-app sv-app--none"><span>{label}</span><b>-</b></li>
  if (cell.state === 'unknown') return <li className="sv-app sv-app--unknown"><span>{label}</span><b>{cell.amountText}</b><small>{cell.minText}</small></li>
  if (cell.state === 'over') return <li className="sv-app sv-app--over"><span>{label}</span><b>{cell.amountText}</b><small>{cell.minText}</small></li>
  return (
    <li className="sv-app">
      <OfferButton cell={cell} className="sv-app__link"><span>{label}</span><b>{cell.amountText}</b><small>{cell.minText}</small></OfferButton>
    </li>
  )
}

function Card({ row, rank }) {
  const { best } = row
  const label = row.apps.find((a) => a.platform.key === best.platform)?.platform.label ?? best.platform
  const when = capturedLabel(row.capturedAt)
  return (
    <li className="sv-card">
      <div className="sv-card__head">
        <BrandLogo name={row.name} size={32} />
        <span className="sv-card__name">{row.name}</span>
        {rank != null && <span className="sv-card__rank">{rank}</span>}
      </div>
      <p className="sv-card__label">아끼는 돈</p>
      <p className="sv-card__big">{best.amountText}</p>
      <p className="sv-card__cond">
        <span>{label}</span>
        {best.channel && <span>{best.channel}</span>}
        {best.chips.filter((c) => c !== best.channel).map((c) => <span key={c}>{c}</span>)}
        <span>{best.minText}</span>
      </p>
      <OfferButton cell={best} className="sv-card__cta">쿠폰 받으러 가기</OfferButton>
      <ul className="sv-apps">{row.apps.map((a) => <AppCell key={a.platform.key} cell={a} />)}</ul>
      {when && <p className="sv-card__when">{when}</p>}
    </li>
  )
}

function parseWon(text) {
  const digits = text.replace(/\D/g, '')
  return digits === '' ? DEFAULT_ORDER_WON : Number(digits)
}

export default function SavingsShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState(String(DEFAULT_ORDER_WON))
  const [categories, setCategories] = useState(() => new Set())

  const load = useCallback(() => {
    setFailed(false)
    setBrands(null)
    // 배너는 쿠팡이츠 허브 링크용이다. 실패해도 목록은 그린다.
    fetchBanners().then(setHubLinks).catch(() => {})
    fetchBrands().then(setBrands).catch(() => setFailed(true))
  }, [])
  useEffect(() => { load() }, [load])

  const order = parseWon(text)
  const view = useMemo(() => (brands ? savingsRows(brands, order, categories) : null), [brands, order, categories])
  const updated = useMemo(() => {
    if (!view) return null
    return [...view.ranked, ...view.unknown].map((r) => r.capturedAt).filter(Boolean).sort().at(-1) ?? null
  }, [view])

  const toggle = (key) => setCategories((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <main className="sv">
      <header className="sv-top">
        <h1>얼마 아끼나</h1>
        {updated && <span className="sv-top__when">{capturedLabel(updated)}</span>}
      </header>
      <label className="sv-input">
        <span>주문 금액</span>
        <input inputMode="numeric" value={order.toLocaleString('ko-KR')} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} aria-label="주문 금액" />
        <span>원</span>
      </label>
      <div className="sv-cats" role="group" aria-label="분류">
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" aria-pressed={categories.has(c.key)} onClick={() => toggle(c.key)}>{c.label}</button>
        ))}
      </div>

      {failed && (
        <div className="sv-state">
          <p>할인 정보 불러오기 실패</p>
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      )}
      {!failed && !view && <p className="sv-state">할인 정보 불러오는 중</p>}
      {view && view.ranked.length === 0 && (
        <div className="sv-state">
          <p>받을 수 있는 할인 없음</p>
          {view.lowestMin != null && <p>가장 낮은 최소주문 {won(view.lowestMin)}</p>}
        </div>
      )}
      {view && view.ranked.length > 0 && (
        <ol className="sv-list">{view.ranked.map((r, i) => <Card key={r.name} row={r} rank={i + 1} />)}</ol>
      )}
      {view && view.unknown.length > 0 && (
        <section>
          <h2 className="sv-sec">최소주문 미확인</h2>
          <ol className="sv-list">{view.unknown.map((r) => <Card key={r.name} row={r} />)}</ol>
        </section>
      )}
    </main>
  )
}
