// #235 홈 시안 "신뢰 먼저". 병합하지 않는 껍데기. 문구는 COPY 한 곳에 모은다(설계 §5-1, 병합 대상 아님).
import { useEffect, useState } from 'react'
import { openWithNotice } from '../../offerLink.js'
import { agoText, cardOf, lastChecked, loadHome, visibleBrands } from './data.js'
import './trust.css'

const COPY = {
  headAgo: (ago) => `마지막 확인 ${ago}`,
  method: '앱 화면에서 직접 확인한 값',
  cardAgo: (app, ago) => (app ? `${app} 앱에서 ${ago} 확인` : `${ago} 확인`),
  exact: '확정',
  inexact: '추정',
  minUnknown: '최소주문 미확인',
  minOf: (m) => (m === '최소주문 없음' ? m : `최소주문 ${m}원`),
  go: '쿠폰 받으러 가기',
  loading: '불러오는 중이에요',
  failed: '할인 정보를 불러오지 못했어요',
}

// ponytail: 브라우저에선 안 돈다. scripts/ssr-template.mjs가 coupon-card CSS 조각을 요구해 빌드가 죽어서 조각만 남긴다.
if (typeof window === 'undefined') import('../../styles/coupon-card.css')

const hhmm = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })

export default function TrustShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    loadHome().then(({ brands }) => setBrands(brands), () => setFailed(true))
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (failed) return <p className="trust-msg">{COPY.failed}</p>
  if (!brands) return <p className="trust-msg">{COPY.loading}</p>
  const last = lastChecked(brands)
  const lastAgo = last && agoText(last, now)
  return (
    <main className="trust">
      <header className="trust-head">
        {lastAgo && (
          <p className="trust-head__big">{COPY.headAgo(lastAgo)} <span className="trust-head__time">{hhmm(last)}</span></p>
        )}
        <p className="trust-head__method">{COPY.method}</p>
      </header>
      <ul className="trust-list">
        {visibleBrands(brands).map((b) => <TrustCard key={b.name} card={cardOf(b)} now={now} />)}
      </ul>
    </main>
  )
}

function TrustCard({ card, now }) {
  const ago = card.capturedAt && agoText(card.capturedAt, now)
  const exact = card.certainty === 'exact'
  return (
    <li className="trust-card">
      <div className="trust-card__top">
        <span className="trust-card__name">{card.name}</span>
        <span className={`trust-mark ${exact ? 'trust-mark--exact' : 'trust-mark--inexact'}`}>
          {exact ? COPY.exact : COPY.inexact}
        </span>
      </div>
      {ago && <p className="trust-card__ago">{COPY.cardAgo(card.platform, ago)}</p>}
      <p className="trust-card__amount">{card.amount}</p>
      <p className="trust-card__cond">
        {card.chips.map((t) => <span key={t} className="trust-chip">{t}</span>)}
        <span className="trust-card__min">{card.min == null ? COPY.minUnknown : COPY.minOf(card.min)}</span>
      </p>
      <ul className="trust-apps">
        {card.apps.map((a) => <li key={a.label}><span>{a.label}</span> {a.amount ?? '-'}</li>)}
      </ul>
      {card.link && (
        <a className="trust-go" href={card.link} target={card.link.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
          onClick={(e) => openWithNotice(e, card.link)}>{COPY.go}</a>
      )}
    </li>
  )
}
