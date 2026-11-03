// 굵은 타이포 시안(#242). 진한 바탕과 아주 큰 금액. 병합하지 않는 시안이다.
import { useEffect, useState } from 'react'
import { PLATFORM_BY_KEY } from '../../platforms.js'
import { openWithNotice } from '../../offerLink.js'
import { MIN_UNKNOWN_LABEL, loadBoldHome } from './data.js'
import './bold.css'

const stamp = (iso) => {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).reduce((m, p) => ({ ...m, [p.type]: p.value }), {})
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
)

// 숫자와 '원 할인'을 나눠 크기만 달리 그린다. 묶음 행사처럼 숫자가 아닌 원문은 그대로.
function Amount({ card }) {
  const m = /^([\d,]+)원$/.exec(card.amountText)
  return m
    ? <span className="bd-amt"><b>{m[1]}</b><small>원 할인</small></span>
    : <span className="bd-amt bd-amt--text"><b>{card.amountText}</b></span>
}

function Card({ card }) {
  const { href } = card
  const web = href.startsWith('http')
  const app = PLATFORM_BY_KEY[card.appChip]?.label ?? card.appChip
  return (
    <a className="bd-card" data-platform={card.appChip} href={href}
       target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       aria-label={`${card.brandName} ${card.amountText}, 앱으로 이동`}
       onClick={(e) => openWithNotice(e, href)}>
      <span className="bd-brand">
        {card.popularRank != null && <em className="bd-rank">{card.popularRank}</em>}
        {card.brandName}
      </span>
      <Amount card={card} />
      <span className="bd-chips">
        <span className="bd-chip bd-chip--app">{app}</span>
        {card.chips.map((c) => <span className="bd-chip" key={`${c.kind}:${c.text}`}>{c.text}</span>)}
      </span>
      <span className="bd-min">{card.minLabel ?? MIN_UNKNOWN_LABEL}</span>
      <span className="bd-go"><Arrow /></span>
    </a>
  )
}

export default function BoldShell() {
  const [category, setCategory] = useState(null)
  const [home, setHome] = useState(null)

  useEffect(() => {
    let alive = true
    loadBoldHome({ category }).then((h) => { if (alive) setHome(h) }).catch(() => { /* 실패 안내 문구는 정하지 않았다: 빈 바탕 */ })
    return () => { alive = false }
  }, [category])

  return (
    <div className="bd-root">
      <header className="bd-head">
        {home?.capturedAt && <time dateTime={home.capturedAt}>{stamp(home.capturedAt)}</time>}
      </header>
      <nav className="bd-cats">
        {(home?.categories ?? []).map((c) => (
          <button key={c.key} type="button" className="bd-cat" aria-pressed={category === c.key}
                  onClick={() => setCategory(category === c.key ? null : c.key)}>{c.label}</button>
        ))}
      </nav>
      <main className="bd-list">
        {(home?.cards ?? []).map((c) => <Card key={c.key} card={c} />)}
      </main>
    </div>
  )
}
