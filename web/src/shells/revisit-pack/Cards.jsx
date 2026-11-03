import { useState } from 'react'
import { agoText, isStale } from './data.js'
import { getAnalyticsContext } from '../../analytics-context.js'
import { optedOut } from '../../privacy.js'
import { enablePush, pushAvailability } from '../../pushNotifications.js'

function Ago({ iso, now }) {
  const text = agoText(iso, now)
  if (!text) return null
  return <span className={`rp-ago${isStale(iso, now) ? ' rp-ago--stale' : ''}`}>{text} 갱신</span>
}

function Chips({ chips }) {
  const [open, setOpen] = useState(false)
  const list = open ? [...chips.shown, ...chips.folded] : chips.shown
  if (list.length === 0) return null
  return (
    <span className="rp-chips">
      {list.map((t) => <span key={t} className="rp-chip">{t}</span>)}
      {!open && chips.folded.length > 0 && (
        <button type="button" className="rp-chip rp-chip--more" onClick={() => setOpen(true)}>+{chips.folded.length}</button>
      )}
    </span>
  )
}

// 내 브랜드 줄의 칩 하나: 이름, 최고 금액, 누르면 앱 링크.
export function BrandPill({ card, now }) {
  const { head } = card
  return (
    <a className="rp-pill" href={head?.href} target="_blank" rel="noopener">
      <span className="rp-pill__name">{card.name}</span>
      <span className="rp-pill__amount">{card.headAmount || '-'}</span>
      <Ago iso={card.captured} now={now} />
    </a>
  )
}

// 새 오퍼 카드.
export function NewCard({ item, card, now }) {
  const { cell } = item
  return (
    <a className="rp-new" href={cell.href} target="_blank" rel="noopener">
      <span className="rp-new__tag">NEW</span>
      <span className="rp-new__name">{item.brand.name}</span>
      <span className="rp-new__amount">{cell.amount}</span>
      <span className="rp-new__min">{cell.min}</span>
      <Chips chips={cell.chips} />
      <Ago iso={card.captured} now={now} />
    </a>
  )
}

// 목록 카드: 대표 금액 + 앱별 네 칸(없으면 `-`, 모르면 기존 라벨).
export function ListCard({ card, saved, onToggleSave, now }) {
  const { head } = card
  return (
    <article className="rp-card">
      <header className="rp-card__head">
        <h3 className="rp-card__name">{card.name}</h3>
        <button type="button" className="rp-save" aria-pressed={saved} onClick={() => onToggleSave(card.name)}>
          {saved ? '담음' : '내 브랜드에 담기'}
        </button>
      </header>
      {head && (
        <a className="rp-card__best" href={head.href} target="_blank" rel="noopener">
          <span className="rp-card__amount">{card.headAmount}</span>
          <span className="rp-card__min">{head.min}</span>
          <Chips chips={head.chips} />
        </a>
      )}
      <ul className="rp-apps">
        {card.apps.map(({ platform, label, cell }) => (
          <li key={platform} className="rp-app">
            <span className="rp-app__label">{label}</span>
            {cell ? (
              <a className="rp-app__cell" href={cell.href} target="_blank" rel="noopener">
                <span className="rp-app__amount">{cell.amount}</span>
                <span className="rp-app__min">{cell.min}</span>
              </a>
            ) : <span className="rp-app__none">-</span>}
          </li>
        ))}
      </ul>
      <Ago iso={card.captured} now={now} />
    </article>
  )
}

// 알림 카드. 새 구독 로직은 없고 기존 pushNotifications.enablePush를 그대로 부른다.
export function AlertCard() {
  const [state, setState] = useState('idle')
  async function start() {
    const availability = pushAvailability()
    if (availability === 'unsupported') return setState('unsupported')
    if (availability === 'ios-install') return setState('ios')
    if (availability === 'denied') return setState('denied')
    setState('busy')
    try {
      const { visitorId } = getAnalyticsContext()
      setState((await enablePush({ visitorId, analyticsEnabled: !optedOut() })) ? 'on' : 'failed')
    } catch { setState('failed') }
  }
  const note = {
    on: '알림이 켜졌어요',
    failed: '알림이 켜지지 않았어요',
    denied: '브라우저 설정에서 알림을 허용해 주세요',
    ios: '홈 화면에 추가한 뒤 앱에서 켜 주세요',
    unsupported: '이 브라우저에서는 알림을 쓸 수 없어요',
  }[state]
  return (
    <section className="rp-alert">
      <p className="rp-alert__title">새 쿠폰이 뜨면 알려드려요</p>
      <button type="button" className="rp-alert__cta" disabled={state === 'busy' || state === 'on'} onClick={start}>알림 받기</button>
      {note && <p className="rp-alert__note" role="status">{note}</p>}
    </section>
  )
}
