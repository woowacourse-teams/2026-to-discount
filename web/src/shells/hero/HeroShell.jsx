// 홈 리뉴얼 시안 "오늘의 한 장"(#231). 버리는 시안이라 병합하지 않는다.
// 맨 위에 오늘 가장 큰 할인 하나를 큰 숫자 카드로, 아래에 짧은 목록. 계산은 data.js가 기존 모듈로 한다.
import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { openWithNotice, setHubLinks } from '../../offerLink.js'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { toHeroModel } from './data.js'
import './hero.css'

// 모르는 최소주문은 칸을 비우지 않고 기존 정식 라벨로 그린다(이슈 #231 결정, couponModel.conditionTable과 같은 말).
const MIN_UNKNOWN = '최소주문 미확인'

// 표시용 포맷뿐이다. 한국 시각으로 "N월 N일 HH:MM". 읽을 수 없으면 null이라 줄을 그리지 않는다.
function checkedText(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.month}월 ${p.day}일 ${p.hour}:${p.minute} 기준`
}

function minText(card) {
  if (card.minLabel == null) return MIN_UNKNOWN
  if (card.minLabel === '최소주문 없음') return card.minLabel
  return `최소주문 ${card.minLabel}원`
}

function Conditions({ card }) {
  return (
    <div className="hero-cond">
      {card.chips.map((c) => <span key={c} className="hero-chip">{c}</span>)}
      <span className="hero-min">{minText(card)}</span>
    </div>
  )
}

// href가 없으면(앱을 모름) 링크 없이 내용만 그린다.
function Linked({ card, className, label, children }) {
  if (!card.href) return <div className={className}>{children}</div>
  const web = card.href.startsWith('http')
  return (
    <a className={className} href={card.href} aria-label={label}
       target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       onClick={(e) => openWithNotice(e, card.href, { offerPrompt: true })}>
      {children}
    </a>
  )
}

function Hero({ card }) {
  const label = `${card.brandName} ${card.amountLabel}, 앱으로 이동`
  return (
    <section className="hero-card" aria-label="오늘 가장 큰 할인">
      <div className="hero-card__brand">
        <BrandLogo name={card.brandName} size={44} />
        <strong>{card.brandName}</strong>
      </div>
      <p className="hero-card__amount">{card.amountLabel}</p>
      <div className="hero-card__app"><PlatformBadge platformKey={card.platform} brand={card.brandName} /></div>
      <Conditions card={card} />
      <Linked card={card} className="hero-cta" label={label}>쿠폰 받으러 가기</Linked>
    </section>
  )
}

function Row({ card }) {
  return (
    <li>
      <Linked card={card} className="hero-row" label={`${card.brandName} ${card.amountLabel}, 앱으로 이동`}>
        <BrandLogo name={card.brandName} size={40} />
        <span className="hero-row__main">
          <strong className="hero-row__name">{card.brandName}</strong>
          <span className="hero-row__min">{minText(card)}</span>
        </span>
        <span className="hero-row__amount">{card.amountLabel}</span>
        <PlatformBadge platformKey={card.platform} brand={card.brandName} />
      </Linked>
    </li>
  )
}

function Skeleton() {
  return (
    <div className="hero-skel" aria-hidden="true">
      <div className="hero-skel__card" />
      <div className="hero-skel__row" /><div className="hero-skel__row" /><div className="hero-skel__row" />
    </div>
  )
}

export default function HeroShell() {
  const initial = typeof window !== 'undefined' ? window.__SSR__ : null
  const [brands, setBrands] = useState(initial?.brands ?? null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (reloadKey === 0 && initial?.brands) return undefined
    let alive = true
    setError(null)
    setBrands(null)
    fetchBrands()
      .then((v) => { if (alive) setBrands(v) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [reloadKey])

  // 배너는 그리지 않는다. offerLink의 허브 단계가 쓰도록 setHubLinks에만 넘긴다. 실패는 조용히 넘긴다.
  useEffect(() => {
    fetchBanners().then(setHubLinks).catch(() => {})
  }, [])

  const model = useMemo(() => (brands ? toHeroModel(brands) : null), [brands])
  const checked = model ? checkedText(model.checkedAt) : null

  return (
    <main className="hero-shell">
      <header className="hero-head">
        <span className="hero-head__name">배달앱 할인모음</span>
        {checked && <span className="hero-head__time">{checked}</span>}
      </header>
      {error && (
        <div className="hero-msg" role="alert">
          <p>할인 정보를 못 불러옴</p>
          <button type="button" className="hero-msg__retry" onClick={() => setReloadKey((k) => k + 1)}>다시 시도</button>
        </div>
      )}
      {!error && !model && <Skeleton />}
      {model && !model.hero && model.list.length === 0 && <div className="hero-msg"><p>브랜드 없음</p></div>}
      {model?.hero && <Hero card={model.hero} />}
      {model && model.list.length > 0 && (
        <ul className="hero-list">{model.list.map((c) => <Row key={c.brandName} card={c} />)}</ul>
      )}
    </main>
  )
}
