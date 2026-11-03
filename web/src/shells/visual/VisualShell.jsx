import React, { useEffect, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { setHubLinks } from '../../offerLink.js'
import { homeCards, imageFor, loadHome, stampLabel, topCards } from './data.js'
import './visual.css'

// http 링크만 새 탭으로. 앱 스킴(coupangeats://)은 일반 앵커로 둔다.
function linkProps(href) {
  return /^https?:/i.test(href) ? { href, target: '_blank', rel: 'noopener noreferrer' } : { href }
}

// 링크가 없으면 앵커를 만들지 않는다(빈 href는 현재 페이지를 연다).
function Wrap({ href, className, children }) {
  return href
    ? <a className={className} {...linkProps(href)}>{children}</a>
    : <div className={`${className} vs-nolink`}>{children}</div>
}

function Chips({ chips }) {
  if (chips.length === 0) return null
  return (
    <div className="vs-chips">
      {chips.map((c, i) => <span className="vs-chip" key={`${c.kind}-${c.text}-${i}`}>{c.text}</span>)}
    </div>
  )
}

function Stamp({ iso }) {
  const text = stampLabel(iso)
  return text ? <div className="vs-stamp">{text}</div> : null
}

function BigCard({ card }) {
  const look = imageFor(card.brand)
  return (
    <Wrap href={card.href} className="vs-big">
      <div className="vs-photo" style={{ background: look.gradient }}>
        <span className="vs-photo__logo"><BrandLogo name={card.brand.name} size={36} /></span>
        <span className="vs-photo__emoji" aria-hidden="true">{look.emoji}</span>
      </div>
      <div className="vs-big__body">
        <div className="vs-big__name">{card.brand.name}</div>
        <div className="vs-big__amount">{card.amountLabel}</div>
        <Chips chips={card.chips} />
        <div className="vs-min">{card.minLabel}</div>
        <Stamp iso={card.capturedAt} />
        {card.href && <div className="vs-cta">{card.platformLabel}에서 받기</div>}
      </div>
    </Wrap>
  )
}

function Row({ card }) {
  const look = imageFor(card.brand)
  return (
    <Wrap href={card.href} className="vs-row">
      <div className="vs-row__top">
        <span className="vs-thumb" style={{ background: look.gradient }} aria-hidden="true">{look.emoji}</span>
        <span className="vs-row__logo"><BrandLogo name={card.brand.name} size={28} /></span>
        <div className="vs-row__main">
          <div className="vs-row__name">{card.brand.name}</div>
          <div className="vs-row__amount">{card.amountLabel}</div>
          <Chips chips={card.chips} />
          <div className="vs-min">{card.minLabel}</div>
        </div>
      </div>
      <div className="vs-apps">
        {card.apps.map((a) => (
          <div className="vs-app" key={a.key}>
            <span className="vs-app__label">{a.label}</span>
            <span className="vs-app__text">{a.text}</span>
          </div>
        ))}
      </div>
    </Wrap>
  )
}

export default function VisualShell() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let alive = true
    loadHome()
      .then(({ brands, banners }) => {
        setHubLinks(banners) // 허브 링크가 있어야 offerLink가 사다리 끝까지 간다
        if (alive) setState({ status: 'ok', cards: homeCards(brands) })
      })
      .catch(() => { if (alive) setState({ status: 'error' }) })
    return () => { alive = false }
  }, [])

  const cards = state.cards ?? []
  const top = topCards(cards)
  const rest = cards.slice(top.length)
  const newest = cards.map((c) => c.capturedAt).filter(Boolean).sort().pop() ?? null

  return (
    <div className="vs-root">
      <header className="vs-head">거지들의 할인</header>
      {state.status === 'loading' && <p className="vs-msg">불러오는 중</p>}
      {state.status === 'error' && <p className="vs-msg">목록을 불러오지 못했어요. 새로고침해 주세요.</p>}
      {state.status === 'ok' && cards.length === 0 && <p className="vs-msg">보여줄 할인이 없어요.</p>}
      {top.length > 0 && (
        <div className="vs-rail">
          {top.map((c) => <BigCard key={c.brand.name} card={c} />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="vs-list">
          {rest.map((c) => <Row key={c.brand.name} card={c} />)}
        </div>
      )}
      {state.status === 'ok' && <footer className="vs-foot"><Stamp iso={newest} /></footer>}
    </div>
  )
}
