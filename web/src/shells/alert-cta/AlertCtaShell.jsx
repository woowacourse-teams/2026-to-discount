import { useEffect, useMemo, useState } from 'react'
import PushNotificationSetting from '../../PushNotificationSetting.jsx'
import { CATEGORIES } from '../../filters.js'
import { openWithNotice } from '../../offerLink.js'
import { pushAvailability } from '../../pushNotifications.js'
import { headAgo, loadHome, toCards } from './data.js'
import './alert-cta.css'

const EVERY = 4

function AlertCard({ enabled, big, onPress }) {
  if (enabled) {
    return (
      <div className={`ac-alert ac-alert--on${big ? ' ac-alert--big' : ''}`}>
        <b>알림 켜짐</b>
        <span>내 브랜드 새 할인이 뜨면 알려드려요</span>
      </div>
    )
  }
  return (
    <button type="button" className={`ac-alert${big ? ' ac-alert--big' : ''}`} onClick={onPress}>
      <b>내 브랜드 새 할인 알림 받기</b>
      <span>할인이 새로 뜨면 바로 알려드려요</span>
      <i className="ac-alert__go">알림 켜기</i>
    </button>
  )
}

function BrandCard({ card }) {
  return (
    <article className="ac-card">
      <header className="ac-card__head">
        <h2>{card.name}</h2>
        <strong>{card.best ?? '-'}</strong>
      </header>
      <ul className="ac-rows">
        {card.rows.map((r) => (
          <li key={r.key} className="ac-row">
            <span className="ac-row__app">{r.label}</span>
            {r.offer ? (
              <>
                <span className="ac-row__amount">{r.amount}</span>
                <span className="ac-row__min">{r.min}</span>
                {r.chips.length > 0 && (
                  <span className="ac-row__chips">{r.chips.map((c) => <em key={c}>{c}</em>)}</span>
                )}
                <a
                  className="ac-row__go"
                  href={r.href}
                  target={r.href?.startsWith('https') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={(e) => openWithNotice(e, r.href)}
                >받으러 가기</a>
              </>
            ) : (
              <span className="ac-row__amount ac-row__none">-</span>
            )}
          </li>
        ))}
      </ul>
      {card.ago && <p className="ac-card__ago">값 {card.ago}</p>}
    </article>
  )
}

export default function AlertCtaShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [category, setCategory] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [available, setAvailable] = useState(false)
  const [slot, setSlot] = useState(null)

  // 빌드 스크립트(ssr-template.mjs)가 쿠폰 카드 CSS 조각을 찾는다. App.jsx:164와 같은 줄.
  useEffect(() => { import('../../styles/coupon-card.css') }, [])

  useEffect(() => {
    let alive = true
    loadHome().then((b) => alive && setBrands(b)).catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [])

  // 서버 렌더와 맞추려고 마운트 뒤에 읽는다(읽기만).
  useEffect(() => {
    setAvailable(pushAvailability() === 'ready')
    try { setEnabled(localStorage.getItem('discount-push-enabled') === '1') } catch { /* 저장소 막힘 */ }
    const sync = (e) => setEnabled(!!e.detail)
    window.addEventListener('discount-push-state', sync)
    return () => window.removeEventListener('discount-push-state', sync)
  }, [])

  const cards = useMemo(() => (brands ? toCards(brands, category) : []), [brands, category])
  const press = () => window.dispatchEvent(new Event('discount-push-toggle'))
  const showAlert = available || enabled

  return (
    <div className="ac-shell">
      <PushNotificationSetting toggleSlot={slot} />
      <div ref={setSlot} />
      <header className="ac-top">
        <h1>배달앱 할인 한눈에</h1>
        {brands && headAgo(brands) && <p>가장 최근 값 {headAgo(brands)}</p>}
      </header>
      {showAlert && <AlertCard enabled={enabled} big onPress={press} />}
      <nav className="ac-cats" aria-label="분류">
        <button type="button" className={category == null ? 'is-on' : ''} onClick={() => setCategory(null)}>전체</button>
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={category === c.key ? 'is-on' : ''} onClick={() => setCategory(c.key)}>{c.label}</button>
        ))}
      </nav>
      {failed && <p className="ac-msg">할인을 불러오지 못했어요</p>}
      {!brands && !failed && <p className="ac-msg">불러오는 중</p>}
      {cards.map((card, i) => (
        <div key={card.name}>
          <BrandCard card={card} />
          {showAlert && (i + 1) % EVERY === 0 && <AlertCard enabled={enabled} onPress={press} />}
        </div>
      ))}
      {showAlert && cards.length > 0 && <AlertCard enabled={enabled} big onPress={press} />}
    </div>
  )
}
