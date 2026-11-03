// 홈 리뉴얼 시안: 앱별 탭(#232). 버리는 시안이라 병합하지 않는다. 데이터는 data.js가 기존 모듈에서 읽는다.
import { useEffect, useMemo, useState } from 'react'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { OWN, OWN_LABEL, PLATFORM_BY_KEY } from '../../platforms.js'
import { TABS, cardOf, loadHome, newestCapture, perApp, tabBrands } from './data.js'
import './app-tabs.css'

// 시안 임시 문구(세션이 정함, 병합 전 개발자가 확정): "N분 전 확인", "받기".
function ago(iso, now) {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 60) return `${min}분 전 확인`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h}시간 전 확인` : `${Math.floor(h / 24)}일 전 확인`
}

function appName(key) {
  return key === OWN ? OWN_LABEL : PLATFORM_BY_KEY[key]?.label ?? key
}

function Card({ card, tab, brand, now }) {
  const { offer } = card
  const when = ago(card.capturedAt, now)
  return (
    <li>
      <a className="at-card" href={card.href} aria-label={`${brand.name} ${card.amount}, 앱으로 이동`}
         target={card.href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer"
         onClick={(e) => openWithNotice(e, card.href)}>
        <BrandLogo name={brand.name} size={48} />
        <span className="at-body">
          <span className="at-name">{brand.shortName ?? brand.name}</span>
          <span className={`at-amt${card.soldOut ? ' at-amt--sold' : ''}`}>
            {card.amount}{card.soldOut && <em>품절</em>}
          </span>
          <span className="at-min">{card.minLabel == null ? '최소주문 미확인' : card.minOrder === 0 ? card.minLabel : `최소주문 ${card.minLabel}원`}</span>
          {card.chips.length > 0 && (
            <span className="at-chips">{card.chips.map((c) => <i key={`${c.kind}:${c.text}`}>{c.text}</i>)}</span>
          )}
          <span className="at-src">
            {tab === 'all' && <><PlatformBadge platformKey={offer.platform} />{appName(offer.platform)}</>}
            {tab !== 'all' && appName(offer.platform)}
            {when && <> · {when}</>}
          </span>
          {tab === 'all' && (
            <span className="at-apps">
              {perApp(brand).map((a) => (
                <span key={a.key} className={a.has ? undefined : 'at-apps--none'}>
                  {PLATFORM_BY_KEY[a.key].initial} {!a.has ? '-' : a.amount != null ? a.amount.toLocaleString('ko-KR') : '?'}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="at-go">받기</span>
      </a>
    </li>
  )
}

export default function AppTabsShell() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState('all')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    loadHome().then((b) => { if (alive) setBrands(b) }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [])

  const list = useMemo(() => (brands ? tabBrands(brands, tab) : []), [brands, tab])
  const last = useMemo(() => (brands ? ago(newestCapture(brands), now) : null), [brands, now])

  return (
    <main className="at-shell">
      <header className="at-head">
        <h1>배달앱 할인모음</h1>
        <p>{last ?? ' '}</p>
      </header>
      <div className="at-tabs" role="tablist" aria-label="앱">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                  className={tab === t.key ? 'on' : undefined} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {error && <p className="at-empty">-</p>}
      {brands && list.length === 0 && <p className="at-empty">-</p>}
      <ul className="at-list">
        {list.map((b) => <Card key={b.name} card={cardOf(b)} tab={tab} brand={b} now={now} />)}
      </ul>
    </main>
  )
}
