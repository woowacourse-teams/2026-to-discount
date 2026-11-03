import { useCallback, useEffect, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { loadCards } from './data.js'
import './category-hero.css'

function Card({ card }) {
  const { href } = card
  const external = href?.startsWith('http')
  return (
    <li className="chs-card">
      <div className="chs-card__head">
        <span className="chs-card__cat">{card.label}</span>
        <BrandLogo name={card.brandName} />
        <span className="chs-card__brand">{card.brandName}</span>
      </div>
      <p className="chs-card__amount">
        <strong>{card.amount}</strong>
        <span className="chs-card__app">{card.platformLabel}</span>
      </p>
      <p className="chs-card__min">{card.min}</p>
      {card.chips.length > 0 && (
        <ul className="chs-chips">
          {card.chips.map((c) => <li key={`${c.kind}-${c.text}`} className="chs-chip">{c.text}</li>)}
        </ul>
      )}
      {card.note && <p className="chs-card__note">{card.note}</p>}
      <p className="chs-card__trust">{[card.capturedText, `${card.platformLabel} 오퍼`].filter(Boolean).join(' · ')}</p>
      <ul className="chs-apps">
        {card.apps.map((a) => (
          <li key={a.key} className={`chs-app${a.key === card.platformKey ? ' chs-app--main' : ''}`}>
            <span className="chs-app__name">{a.label}</span>
            <span className={`chs-app__amount chs-app__amount--${a.state}`}>{a.amount}</span>
            {a.min && <span className="chs-app__min">{a.min}</span>}
          </li>
        ))}
      </ul>
      {href ? (
        <a
          className="chs-go"
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          onClick={(e) => openWithNotice(e, href)}
        >
          받으러 가기
        </a>
      ) : (
        <span className="chs-go chs-go--off" aria-disabled="true">받으러 가기</span>
      )}
    </li>
  )
}

export default function CategoryHeroShell() {
  const [cards, setCards] = useState(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    let alive = true
    setFailed(false)
    setCards(null)
    loadCards()
      .then((v) => { if (alive) setCards(v) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  useEffect(() => load(), [load])
  // 빌드 후처리(scripts/ssr-template.mjs)가 coupon-card-*.css 조각을 찾는다. 이 조각은 App.jsx의 같은 동적 import에서만 생겨,
  // 홈을 껍데기로 바꾸면 빌드가 죽는다. 조각만 살리려고 같은 import를 둔다(이 시안 한정, 화면에는 쓰지 않는다).
  useEffect(() => { import('../../styles/coupon-card.css') }, [])

  return (
    <main className="chs">
      <h1 className="chs__title">카테고리별 오늘 가장 큰 할인</h1>
      {failed ? (
        <div className="chs__error">
          <p>불러오지 못했어요</p>
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      ) : cards == null ? (
        <ul className="chs-list" aria-busy="true">
          <li className="chs-card chs-card--ghost" />
          <li className="chs-card chs-card--ghost" />
        </ul>
      ) : (
        <ul className="chs-list">
          {cards.map((c) => <Card key={c.key} card={c} />)}
        </ul>
      )}
    </main>
  )
}
