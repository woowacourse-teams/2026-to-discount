import { useEffect, useRef, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { openWithNotice, setHubLinks } from '../../offerLink.js'
import { BrandLogo } from '../../logos.jsx'
import SiteFooter from '../../SiteFooter.jsx'
import { buildHome, capturedAgo, capturedDate } from './data.js'
import './first3s.css'

// 시안용 임시 문구(이슈 #274 결정). 병합하지 않는다.
const VALUE_LINE = '배달앱 쿠폰, 가장 큰 것만 모았어요'
const CTA = '쿠폰 받으러 가기'
const SEEN_KEY = 'dk_first3s_seen'

function useSeenBefore() {
  // 서버 HTML과 맞추려고 첫 렌더는 늘 "처음"이다. 마운트 뒤에 읽어 접는다.
  const [seen, setSeen] = useState(false)
  const ran = useRef(false) // StrictMode(개발)가 effect를 두 번 돌려 방금 쓴 키를 읽는 일을 막는다
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    try {
      if (localStorage.getItem(SEEN_KEY)) setSeen(true)
      else localStorage.setItem(SEEN_KEY, '1')
    } catch { /* 저장소가 막히면 매번 처음처럼 */ }
  }, [])
  return seen
}

// 갱신 시각. 첫 렌더는 날짜(서버와 같게), 마운트 뒤에 "N분 전"으로 바꾼다.
function Updated({ iso }) {
  const [now, setNow] = useState(null)
  useEffect(() => { setNow(Date.now()) }, [])
  if (!iso) return null
  const text = now == null ? capturedDate(iso) : capturedAgo(iso, now)
  return text ? <span className="f3-updated">{text} 갱신</span> : null
}

function Chips({ view }) {
  return (
    <span className="f3-chips">
      {view.chips.map((c) => <span key={`${c.kind}-${c.text}`} className={`f3-chip f3-chip--${c.kind}`}>{c.text}</span>)}
      <span className={`f3-chip f3-chip--min${view.min.kind === 'unknown' ? ' f3-chip--unknown' : ''}`}>{view.min.label}</span>
    </span>
  )
}

function Hero({ card }) {
  const v = card.main
  const body = (
    <>
      <span className="f3-hero__label">오늘 최고 할인</span>
      <span className="f3-hero__who">
        <BrandLogo name={card.name} size={40} />
        <span className="f3-hero__name">{card.name}</span>
      </span>
      <span className="f3-hero__amount">{v.amount}</span>
      <span className="f3-hero__app">{v.platformLabel}</span>
      <Chips view={v} />
      {v.note && <span className="f3-note">{v.note}</span>}
    </>
  )
  return (
    <section className="f3-hero" aria-label="오늘 최고 할인">
      <div className="f3-hero__body">{body}</div>
      <Updated iso={v.capturedAt} />
      {v.href && (
        <a
          className="f3-cta"
          href={v.href}
          target={v.href.startsWith('http') ? '_blank' : undefined}
          rel={v.href.startsWith('http') ? 'noreferrer' : undefined}
          onClick={(e) => openWithNotice(e, v.href)}
        >
          {CTA}
        </a>
      )}
    </section>
  )
}

function AppCell({ app }) {
  if (app.kind === 'none') {
    return <span className="f3-app f3-app--none"><span className="f3-app__name">{app.label}</span><span className="f3-app__amt">-</span></span>
  }
  const inner = (
    <>
      <span className="f3-app__name">{app.label}</span>
      <span className="f3-app__amt">{app.amount}</span>
      <span className={`f3-app__min${app.min.kind === 'unknown' ? ' f3-app__min--unknown' : ''}`}>{app.min.label}</span>
    </>
  )
  return app.href
    ? (
      <a
        className="f3-app"
        href={app.href}
        target={app.href.startsWith('http') ? '_blank' : undefined}
        rel={app.href.startsWith('http') ? 'noreferrer' : undefined}
        onClick={(e) => openWithNotice(e, app.href)}
      >
        {inner}
      </a>
    )
    : <span className="f3-app">{inner}</span>
}

function Row({ card }) {
  return (
    <li className="f3-row">
      <div className="f3-row__head">
        <BrandLogo name={card.name} size={32} />
        <span className="f3-row__name">{card.name}</span>
        <span className="f3-row__amount">{card.main.amount}</span>
      </div>
      <div className="f3-row__apps">
        {card.apps.map((a) => <AppCell key={a.key} app={a} />)}
      </div>
      {card.main.note && <p className="f3-note">{card.main.note}</p>}
    </li>
  )
}

export default function First3sShell({ initial = null }) {
  const [brands, setBrands] = useState(initial?.brands ?? null)
  const [error, setError] = useState(null)
  const [tries, setTries] = useState(0)
  const seen = useSeenBefore()
  // 이 화면은 쿠폰 카드를 안 쓴다. 다만 빌드(ssr-template.mjs)가 coupon-card CSS 조각을 찾아 App과 같은 조각이 나오게 둔다.
  useEffect(() => { import('../../styles/coupon-card.css') }, [])

  useEffect(() => {
    let live = true
    setError(null)
    if (!brands) {
      fetchBrands().then((b) => live && setBrands(b)).catch((e) => live && setError(e))
    }
    // App.jsx와 같은 호출: 배너는 화면에 그리지 않고 허브 링크에만 쓴다.
    if (!initial?.banners) {
      fetchBanners().then((b) => live && setHubLinks(b)).catch(() => {})
    }
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tries])

  const home = brands ? buildHome(brands) : null

  return (
    <div className="f3">
      <header className="f3-top">
        {!seen && <p className="f3-value">{VALUE_LINE}</p>}
      </header>
      <main>
        {error && (
          <div className="f3-state">
            <p>목록을 불러오지 못했어요</p>
            <button type="button" className="f3-retry" onClick={() => setTries((n) => n + 1)}>다시 시도</button>
          </div>
        )}
        {!error && !home && <div className="f3-state"><p>불러오는 중이에요</p></div>}
        {home && home.hero && <Hero card={home.hero} />}
        {home && home.empty && <div className="f3-state"><p>지금 보여드릴 할인이 없어요</p></div>}
        {home && home.list.length > 0 && (
          <ul className="f3-list">
            {home.list.map((c) => <Row key={c.name} card={c} />)}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
