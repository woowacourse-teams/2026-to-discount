import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'

const DAY_MS = 24 * 3600e3

export const clock = (ts) => new Date(ts).toLocaleTimeString('ko-KR', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
})

// 링크 판정은 https 시작 하나. 앱 스킴(baemin://, yogiyolink://)은 target을 주지 않는다(새 탭이 about:blank만 띄운다).
export function linkProps(href) {
  if (!href) return {}
  return href.startsWith('https://') ? { href, target: '_blank', rel: 'noopener' } : { href }
}

// 쿠팡이츠는 안내를 띄운 뒤 연다(없으면 안내 없이 허브로 떨어진다, #141).
export function onOpen(card) {
  return (e) => { if (card.platform === 'coupangeats') openWithNotice(e, card.href) }
}

export default function FeedCard({ card }) {
  const stale = card.capturedAt && Date.now() - Date.parse(card.capturedAt) >= DAY_MS
  const body = (
    <>
      <div className="feed-card__top">
        <BrandLogo name={card.name} size={40} />
        <span className="feed-card__name">{card.name}</span>
        {card.isNew && <span className="feed-card__new">신규</span>}
        <span className="feed-card__app"><PlatformBadge platformKey={card.platform} brand={card.name} /></span>
      </div>
      <div className="feed-card__amount">{card.amount}</div>
      {card.chips.length > 0 && (
        <div className="feed-card__chips">
          {card.chips.map((c) => <span key={`${c.kind}-${c.text}`} className="feed-chip">{c.text}</span>)}
        </div>
      )}
      <div className="feed-card__cond">
        <span>{card.min}</span>
        {stale && <span className="feed-card__time">{clock(card.capturedAt)} 기준</span>}
      </div>
      <ul className="feed-card__apps" aria-label="앱별 금액">
        {card.apps.map((a) => (
          <li key={a.key} className={a.key === card.platform ? 'is-main' : ''}>
            <span>{a.label}</span><b>{a.text}</b>
          </li>
        ))}
      </ul>
    </>
  )
  if (!card.href) return <article className="feed-card feed-card--off" data-feed-key={card.key}>{body}</article>
  return (
    <a className="feed-card" data-feed-key={card.key} {...linkProps(card.href)} onClick={onOpen(card)}>
      {body}
    </a>
  )
}
