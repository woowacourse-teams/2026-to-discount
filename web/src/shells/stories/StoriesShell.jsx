import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { latestCaptured } from '../../filters.js'
import { capturedText, loadStories, toStories } from './data.js'
import './stories.css'

const LIST_FIRST = 30

function GoLink({ href, className = '', children }) {
  if (!href) return null
  const web = href.startsWith('http')
  return (
    <a
      className={`stx-go ${className}`}
      href={href}
      target={web ? '_blank' : undefined}
      rel={web ? 'noreferrer' : undefined}
      onClick={(e) => openWithNotice(e, href)}
    >
      {children}
    </a>
  )
}

function Chips({ chips }) {
  if (chips.length === 0) return null
  return (
    <ul className="stx-chips">
      {chips.map((c) => <li key={`${c.kind}-${c.text}`} className={`stx-chip stx-chip--${c.kind}`}>{c.text}</li>)}
    </ul>
  )
}

function AppRows({ rows }) {
  return (
    <ul className="stx-rows">
      {rows.map((r) => (
        <li key={r.key} className="stx-row">
          <PlatformBadge platformKey={r.key} />
          <span className="stx-row__amount">{r.amount}</span>
          {r.min && <span className="stx-row__min">{r.min}</span>}
        </li>
      ))}
    </ul>
  )
}

function DeckCard({ card }) {
  return (
    <section className="stx-card" aria-label={card.name}>
      <div className="stx-card__body">
        <div className="stx-card__brand">
          <BrandLogo name={card.name} size={56} />
          <h2 className="stx-card__name">{card.name}</h2>
        </div>
        <p className="stx-card__amount">{card.amount}</p>
        <p className="stx-card__app">
          <PlatformBadge platformKey={card.platformKey} brand={card.name} />
          <span>{card.platformLabel}</span>
        </p>
        <Chips chips={card.chips} />
        <p className="stx-card__min">{card.min}</p>
        <AppRows rows={card.rows} />
        {card.captured && <p className="stx-card__time">{card.captured}</p>}
      </div>
      <GoLink href={card.link} className="stx-go--big">받으러 가기</GoLink>
    </section>
  )
}

function Deck({ cards, start, onClose }) {
  const ref = useRef(null)
  const [at, setAt] = useState(start)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = start * el.clientWidth
    document.body.classList.add('stx-lock')
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('stx-lock')
      window.removeEventListener('keydown', onKey)
    }
  }, [start, onClose])

  return (
    <div className="stx-deck" role="dialog" aria-modal="true" aria-label="오늘의 할인">
      <div className="stx-deck__top">
        <div className="stx-bars" aria-hidden="true">
          {cards.map((c, i) => <i key={c.name} className={i <= at ? 'is-on' : ''} />)}
        </div>
        <span className="stx-deck__count">{at + 1} / {cards.length}</span>
        <button type="button" className="stx-deck__close" onClick={onClose} aria-label="닫기">×</button>
      </div>
      <div
        className="stx-deck__track"
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget
          setAt(Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / el.clientWidth))))
        }}
      >
        {cards.map((c) => <DeckCard key={c.name} card={c} />)}
      </div>
    </div>
  )
}

function ListRow({ card }) {
  return (
    <li className="stx-item">
      <div className="stx-item__head">
        <BrandLogo name={card.name} size={40} />
        <div className="stx-item__title">
          <strong>{card.name}</strong>
          <span className="stx-item__min">{card.min}</span>
        </div>
        <span className="stx-item__amount">{card.amount}</span>
        <GoLink href={card.link} className="stx-go--small">받으러 가기</GoLink>
      </div>
      <AppRows rows={card.rows} />
    </li>
  )
}

export default function StoriesShell({ initial = null }) {
  const [data, setData] = useState(initial ? { brands: initial.brands } : null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    let alive = true
    loadStories(initial).then((d) => { if (alive) setData(d) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [initial])

  const stories = useMemo(() => (data ? toStories(data.brands) : null), [data])
  const close = useMemo(() => () => setOpen(null), [])

  if (failed) return <main className="stx-page"><p className="stx-state">할인을 불러오지 못했어요. 새로고침해 주세요.</p></main>
  if (!stories) return <main className="stx-page"><p className="stx-state">불러오는 중이에요.</p></main>

  const { deck, list } = stories
  const stamp = capturedText(latestCaptured(data.brands.flatMap((b) => b.offers)))
  const first = deck[0]
  const shown = more ? list : list.slice(0, LIST_FIRST)

  return (
    <main className="stx-page">
      <header className="stx-head">
        <h1 className="stx-head__title">오늘의 큰 할인</h1>
        {stamp && <span className="stx-head__time">{stamp}</span>}
      </header>

      <nav className="stx-strip" aria-label="오늘 큰 할인 브랜드">
        {deck.map((c, i) => (
          <button key={c.name} type="button" className="stx-story" onClick={() => setOpen(i)}>
            <span className="stx-story__ring"><BrandLogo name={c.name} size={56} /></span>
            <span className="stx-story__name">{c.name}</span>
          </button>
        ))}
      </nav>

      {first && (
        <section className="stx-peek" aria-label={`${first.name} 미리보기`}>
          <button type="button" className="stx-peek__open" onClick={() => setOpen(0)}>
            <span className="stx-peek__brand">{first.name}</span>
            <span className="stx-peek__amount">{first.amount}</span>
            <span className="stx-peek__sub">{first.platformLabel} · {first.min}</span>
          </button>
          <GoLink href={first.link} className="stx-go--big">받으러 가기</GoLink>
        </section>
      )}

      <section className="stx-list" aria-label="전체 할인">
        <h2 className="stx-list__title">전체 할인 <span>{list.length}곳</span></h2>
        <ul>{shown.map((c) => <ListRow key={c.name} card={c} />)}</ul>
        {!more && list.length > LIST_FIRST && (
          <button type="button" className="stx-more" onClick={() => setMore(true)}>더 보기</button>
        )}
      </section>

      {open != null && <Deck cards={deck} start={open} onClose={close} />}
    </main>
  )
}
