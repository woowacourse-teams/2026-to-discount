// 신뢰성 시안(#273). 갱신 띠 + 늦은 화면, 빈 화면, 오류 화면을 정상 화면과 같은 틀로 그린다.
// 시안 전용이라 병합하지 않는다. 분석 이벤트는 생략했다(이 시안의 클릭률은 PostHog로 볼 수 없다).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { openWithNotice } from '../../offerLink.js'
import { cardsOf, loadHome, openAppsOf, popularOf, stateOf, updatedAtOf } from './data.js'
import './stale-state.css'

// 늦음의 경계(분). 임시값이다: 수집 주기를 이 저장소에서 알 수 없고 운영 응답의 capturedAt 분포를 못 봤다(PR 리뷰 포인트).
const STALE_AFTER_MIN = 360
// ?state=stale에서 갱신 시각 뒤로 시계를 옮기는 간격(경계의 두 배)
const STALE_TEST_GAP_MIN = STALE_AFTER_MIN * 2

// 표시 규칙(결과를 바꾸는 판정이 아니다): 시각 -> 지난 분. 읽을 수 없으면 null.
function minutesSince(iso, now) {
  const t = Date.parse(iso)
  if (!iso || Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 60000))
}

function agoText(min) {
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`
  return `${Math.floor(min / 60 / 24)}일 전`
}

function LinkA({ href, className, children, label }) {
  const web = href.startsWith('http')
  return (
    <a className={className} href={href} aria-label={label}
       target={web ? '_blank' : undefined} rel={web ? 'noopener noreferrer' : undefined}
       onClick={(e) => openWithNotice(e, href)}>
      {children}
    </a>
  )
}

function Band({ updatedAt, now, stale }) {
  const min = minutesSince(updatedAt, now)
  if (!updatedAt) return <div className="ss-band ss-band--unknown" role="status">갱신 시각을 알 수 없어요</div>
  if (min == null) return <div className="ss-band ss-band--unknown" role="status">갱신 시각을 읽지 못했어요</div>
  return (
    <div className={`ss-band${stale ? ' ss-band--stale' : ''}`} role="status">
      <span className="ss-band__dot" aria-hidden="true" />
      <b>마지막 갱신 {agoText(min)}</b>
      {stale && <span className="ss-band__warn">오래된 값일 수 있어요</span>}
    </div>
  )
}

function Popular({ list }) {
  if (list.length === 0) return null
  return (
    <section className="ss-pop" aria-label="오늘 인기">
      <h2>오늘 인기</h2>
      <ol>
        {list.map((p) => (
          <li key={p.name}><span className="ss-pop__rank">{p.rank}</span>{p.shortName}</li>
        ))}
      </ol>
    </section>
  )
}

function Card({ c, now, stale }) {
  const min = minutesSince(c.updatedAt, now)
  return (
    <li>
      <LinkA href={c.href} className="ss-card" label={`${c.name} ${c.amount}, ${c.platformLabel}으로 이동`}>
        <span className="ss-card__top">
          <span className="ss-card__name">{c.shortName}</span>
          <span className="ss-card__app">{c.platformLabel}</span>
        </span>
        <span className="ss-card__amt">{c.amount}{c.hasBest && <small>할인</small>}</span>
        <span className="ss-card__chips">
          {c.chips.map((t) => <span key={t} className="ss-chip">{t}</span>)}
          <span className={`ss-chip ss-chip--min${c.min === '최소주문 미확인' ? ' ss-chip--unknown' : ''}`}>{c.min}</span>
        </span>
        <span className="ss-card__apps" aria-label="앱별 할인">
          {c.apps.map((a) => (
            <span key={a.platform} className={`ss-app${a.none ? ' ss-app--none' : ''}`}>{a.label} <b>{a.text}</b></span>
          ))}
        </span>
        <span className={`ss-card__time${stale ? ' ss-card__time--stale' : ''}`}>
          {min == null ? '시각 없음' : agoText(min)}
        </span>
      </LinkA>
    </li>
  )
}

function OpenApps({ title }) {
  const apps = openAppsOf()
  return (
    <div className="ss-open">
      <p>{title}</p>
      <div className="ss-open__row">
        {apps.map((a) => (
          <LinkA key={a.platform} href={a.href} className="ss-btn ss-btn--ghost">{a.label} 열기</LinkA>
        ))}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <ul className="ss-list" aria-busy="true" aria-label="불러오는 중">
      {[0, 1, 2].map((i) => <li key={i} className="ss-card ss-card--skel" />)}
    </ul>
  )
}

export default function StaleStateShell() {
  const forced = useMemo(() => stateOf(typeof location === 'undefined' ? '' : location.search), [])
  const [load, setLoad] = useState({ phase: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let live = true
    setLoad({ phase: 'loading' })
    loadHome(forced).then(
      ({ brands }) => { if (live) setLoad({ phase: 'done', brands }) },
      () => { if (live) setLoad({ phase: 'error' }) },
    )
    return () => { live = false }
  }, [forced, reloadKey])

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])
  const brands = load.brands
  const updatedAt = useMemo(() => updatedAtOf(brands), [brands])
  const cards = useMemo(() => cardsOf(brands), [brands])
  const popular = useMemo(() => popularOf(brands), [brands])

  // ?state=stale은 값은 그대로 두고 시계만 갱신 시각 뒤로 옮긴다.
  const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN
  const now = forced === 'stale' && !Number.isNaN(updatedMs) ? updatedMs + STALE_TEST_GAP_MIN * 60000 : Date.now()
  const min = minutesSince(updatedAt, now)
  const stale = min != null && min >= STALE_AFTER_MIN

  let body
  if (load.phase === 'loading') body = <Skeleton />
  else if (load.phase === 'error') {
    body = (
      <section className="ss-empty ss-empty--error">
        <h2>할인을 불러오지 못했어요</h2>
        <p>잠시 뒤에 다시 시도해 주세요. 앱에서 바로 볼 수도 있어요.</p>
        <button type="button" className="ss-btn" onClick={retry}>다시 시도</button>
        <OpenApps title="앱 바로 열기" />
      </section>
    )
  } else if (cards.length === 0) {
    body = (
      <section className="ss-empty">
        <h2>지금 보여줄 할인이 없어요</h2>
        <p>오늘 보일 할인이 아직 없어요. 앱에서 바로 볼 수 있어요.</p>
        <OpenApps title="앱 바로 열기" />
      </section>
    )
  } else {
    body = (
      <>
        <Popular list={popular} />
        <ul className="ss-list">
          {cards.map((c) => <Card key={c.name} c={c} now={now} stale={stale} />)}
        </ul>
      </>
    )
  }

  const showBand = load.phase === 'done' && cards.length > 0
  return (
    <div className="ss-root">
      {showBand && <Band updatedAt={updatedAt} now={now} stale={stale} />}
      <header className="ss-head"><h1>배달앱 할인 모아보기</h1></header>
      <main className="ss-main">{body}</main>
    </div>
  )
}
