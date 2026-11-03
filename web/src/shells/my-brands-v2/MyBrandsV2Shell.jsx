import { useEffect, useMemo, useState } from 'react'
import { openWithNotice } from '../../offerLink.js'
import {
  CATEGORIES, agoLabel, buildCards, lastCaptured, loadHome, popularList, readStars, splitStars,
  visibleCategories, writeStars,
} from './data.js'
import './my-brands-v2.css'

function Card({ card, starred, onStar }) {
  const open = (e) => { if (card.href) openWithNotice(e, card.href) }
  const link = card.href ? { href: card.href, target: '_blank', rel: 'noopener', onClick: open } : {}
  return (
    <li className="v2-card" id={`v2-${card.name}`}>
      <a className="v2-card__body" {...link}>
        <span className="v2-card__head">
          {card.logoSrc && <img className="v2-card__logo" src={card.logoSrc} alt="" width="28" height="28" loading="lazy" />}
          <span className="v2-card__name">{card.name}</span>
        </span>
        <span className="v2-card__amount">{card.amountLabel}</span>
        <span className="v2-card__chips">
          {card.chips.map((c, i) => <span key={`${c.kind}${i}`} className={`v2-chip v2-chip--${c.kind}`}>{c.text}</span>)}
          <span className="v2-chip v2-chip--min">{card.minLabel}</span>
        </span>
        <span className="v2-card__app">{card.appLabel}</span>
      </a>
      <button type="button" className={`v2-star${starred ? ' is-on' : ''}`} aria-pressed={starred}
        aria-label={`${card.name} 내 브랜드`} onClick={() => onStar(card.name)}>{starred ? '★' : '☆'}</button>
      <a className="v2-go" {...link}>쿠폰 받으러 가기</a>
    </li>
  )
}

export default function MyBrandsV2Shell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [category, setCategory] = useState(null)
  const [stars, setStars] = useState(() => readStars())

  useEffect(() => {
    let alive = true
    loadHome().then((b) => { if (alive) setBrands(b) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const cards = useMemo(
    () => (brands ? splitStars(buildCards(brands, category ? [category] : []), stars) : []),
    [brands, category, stars],
  )
  const popular = useMemo(() => (brands ? popularList(brands) : []), [brands])
  const tabs = useMemo(() => (brands ? visibleCategories(brands, new Set(category ? [category] : [])) : CATEGORIES), [brands, category])
  const ago = brands ? agoLabel(lastCaptured(brands)) : null

  const toggle = (name) => {
    const next = new Set(stars)
    if (!next.delete(name)) next.add(name)
    setStars(next)
    writeStars(next)
  }

  return (
    <main className="v2">
      <header className="v2-top">
        <h1 className="v2-title">오늘의 배달 할인</h1>
        {ago && <p className="v2-ago">{ago} 업데이트</p>}
      </header>
      {popular.length > 0 && (
        <nav className="v2-pop" aria-label="인기 추천">
          <span className="v2-pop__label">인기</span>
          {popular.map((p) => (
            <a key={p.name} className="v2-pop__item" href={`#v2-${p.name}`}
              onClick={(e) => { e.preventDefault(); document.getElementById(`v2-${p.name}`)?.scrollIntoView({ block: 'center' }) }}>
              {p.rank} {p.name}
            </a>
          ))}
        </nav>
      )}
      <div className="v2-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!category} className="v2-tab" onClick={() => setCategory(null)}>전체</button>
        {tabs.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={category === c.key} className="v2-tab"
            onClick={() => setCategory(c.key)}>{c.label}</button>
        ))}
      </div>
      {failed && <p className="v2-empty">-</p>}
      {!brands && !failed && <p className="v2-empty">...</p>}
      <ul className="v2-list">
        {cards.map((card) => <Card key={card.name} card={card} starred={stars.has(card.name)} onStar={toggle} />)}
      </ul>
    </main>
  )
}
