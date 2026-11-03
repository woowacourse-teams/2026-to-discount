import { useRef, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { CATEGORIES, SORT_KEYS, agoText, visibleCategories } from './data.js'

const DEFAULT_DIR = { amount: 'desc', minOrder: 'asc' }

function Card({ card }) {
  const { rep, others, byPlatform } = card
  const ago = agoText(rep.capturedAt)
  return (
    <li className="bs-card">
      <a className="bs-card__main" href={rep.href}
         target={rep.href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
         aria-label={`${card.name} ${rep.amount}, 앱으로 이동`}>
        <BrandLogo name={card.name} size={44} />
        <span className="bs-card__body">
          <span className="bs-card__name">{card.name}</span>
          <span className={`bs-card__amt${rep.soldOut ? ' bs-card__amt--sold' : ''}`}>{rep.amount}</span>
          <span className="bs-card__meta">
            <b>{rep.platformLabel}</b>
            {rep.channel && <i className="bs-chip">{rep.channel}</i>}
            {rep.chips.map((c) => <i key={`${c.kind}:${c.text}`} className="bs-chip">{c.text}</i>)}
          </span>
          <span className={`bs-card__min${rep.minKnown ? '' : ' bs-card__min--unknown'}`}>
            {rep.min}
            {ago && <em> · {ago}</em>}
          </span>
        </span>
        <span className="bs-card__go">쿠폰 받으러 가기</span>
      </a>
      <div className="bs-apps" role="list">
        {byPlatform.map((p) => (
          <span key={p.key} role="listitem" className={`bs-apps__cell${p.offer ? '' : ' bs-apps__cell--none'}`}>
            <small>{p.label}</small>
            {p.offer
              ? <a href={p.offer.href} target={p.offer.href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{p.offer.amount}</a>
              : <span>-</span>}
          </span>
        ))}
      </div>
      {others.length > 0 && (
        <ul className="bs-others">
          {others.map((o) => (
            <li key={o.key}>
              <a href={o.href} target={o.href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                <b>{o.platformLabel}</b> {o.amount}
                <em>{o.min}</em>
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Sheet({ view, brands, filters, setFilters, state }) {
  const [high, setHigh] = useState(false)
  const [dragY, setDragY] = useState(null)
  const ref = useRef(null)
  const drag = useRef(null)
  const bodyRef = useRef(null)

  const lowOffset = () => {
    const h = ref.current?.offsetHeight ?? 0
    return Math.max(0, h - window.innerHeight * 0.65)
  }
  const onDown = (e) => {
    drag.current = { y0: e.clientY, base: high ? 0 : lowOffset(), moved: false, t: Date.now() }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y0
    if (Math.abs(dy) > 4) d.moved = true
    if (d.moved) setDragY(Math.min(lowOffset(), Math.max(0, d.base + dy)))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) { setHigh((h) => !h); setDragY(null); return }
    const low = lowOffset()
    const at = dragY ?? d.base
    setHigh(at < low / 2)
    setDragY(null)
  }

  const sortKey = filters.sorts[0].key
  const pickSort = (s) => setFilters({ ...filters, sorts: [{ key: s.key, dir: DEFAULT_DIR[s.key] ?? 'desc' }] })
  const toggleCat = (key) => {
    const next = new Set(filters.categories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFilters({ ...filters, categories: next })
  }
  const cats = brands ? visibleCategories(brands, filters.categories) : CATEGORIES

  return (
    <section ref={ref} className={`bs-sheet${high ? ' bs-sheet--high' : ''}${dragY != null ? ' bs-sheet--drag' : ''}`}
             style={dragY != null ? { transform: `translateY(${dragY}px)` } : undefined} aria-label="할인 목록">
      <div className="bs-sheet__head">
        <div className="bs-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
             role="button" tabIndex={0} aria-expanded={high} aria-label="목록 펼치기와 접기"
             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setHigh((h) => !h) }}>
          <i />
        </div>
        <div className="bs-chips" role="group" aria-label="정렬">
          {SORT_KEYS.map((s) => (
            <button key={s.key} type="button" className={`bs-pill${sortKey === s.key ? ' bs-pill--on' : ''}`}
                    aria-pressed={sortKey === s.key} onClick={() => pickSort(s)}>{s.label}</button>
          ))}
        </div>
        <div className="bs-chips" role="group" aria-label="분류">
          {cats.map((c) => (
            <button key={c.key} type="button" className={`bs-pill bs-pill--cat${filters.categories.has(c.key) ? ' bs-pill--on' : ''}`}
                    aria-pressed={filters.categories.has(c.key)} onClick={() => toggleCat(c.key)}>{c.label}</button>
          ))}
        </div>
      </div>
      <div className="bs-sheet__body" ref={bodyRef}>
        {state === 'loading' && <div className="bs-skel" aria-hidden="true"><i /><i /><i /><i /></div>}
        {state === 'error' && <p className="bs-state">목록을 불러오지 못했어요. 다시 열어 주세요.</p>}
        {state === 'ready' && view.count === 0 && <p className="bs-state">조건에 맞는 브랜드가 없어요.</p>}
        {state === 'ready' && view.count > 0 && (
          <ul className="bs-list">
            {view.cards.map((c) => <Card key={c.name} card={c} />)}
          </ul>
        )}
      </div>
    </section>
  )
}
