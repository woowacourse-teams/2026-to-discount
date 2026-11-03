// 홈 리뉴얼 시안 hero-trust(#258): 오늘의 한 장 + 신뢰. 버리는 시안이라 병합하지 않는다.
import { useMemo, useState } from 'react'
import BrandGridSkeleton from '../../BrandGridSkeleton.jsx'
import { openWithNotice } from '../../offerLink.js'
import { CATEGORIES, PLATFORMS, listFor, useHeroTrustData } from './data.js'
import './heroTrust.css'

const open = (e, href) => openWithNotice(e, href)
const isWeb = (href) => typeof href === 'string' && href.startsWith('http')

function Trust({ ago, exact, chips, small = false }) {
  const flags = exact ? ['확정'] : chips.filter((c) => ['불확정', '랜덤', '특정메뉴'].includes(c))
  return (
    <p className={`ht-trust${small ? ' ht-trust--sm' : ''}`}>
      {ago && <span className="ht-trust__ago">{ago}</span>}
      {flags.map((f) => <span key={f} className={`ht-trust__flag${exact ? ' is-exact' : ''}`}>{f}</span>)}
    </p>
  )
}

function Hero({ b }) {
  const r = b.rep
  const app = PLATFORMS.find((p) => p.key === r.platform)?.label ?? ''
  return (
    <section className="ht-hero" aria-label="오늘의 한 장">
      <p className="ht-hero__brand">{b.name} <span>{app}</span></p>
      <p className="ht-hero__amt">{r.amount}</p>
      <p className="ht-hero__cond">
        <span>{r.min}</span>
        {r.chips.map((c) => <span key={c} className="ht-chip">{c}</span>)}
      </p>
      <Trust ago={b.ago} exact={r.exact} chips={r.chips} />
      <a className="ht-cta" href={r.href} onClick={(e) => open(e, r.href)}
         target={isWeb(r.href) ? '_blank' : undefined} rel={isWeb(r.href) ? 'noreferrer' : undefined}
         aria-label={`${b.name} ${r.amount}, 앱으로 이동`}>쿠폰 받으러 가기</a>
    </section>
  )
}

function Row({ b }) {
  const r = b.rep
  return (
    <li className="ht-row">
      <a className="ht-row__main" href={r.href} onClick={(e) => open(e, r.href)}
         target={isWeb(r.href) ? '_blank' : undefined} rel={isWeb(r.href) ? 'noreferrer' : undefined}>
        <span className="ht-row__name">{b.name}</span>
        <span className="ht-row__amt">{r.amount}</span>
        <span className="ht-row__min">{r.min}</span>
        <Trust ago={b.ago} exact={r.exact} chips={r.chips} small />
      </a>
      <div className="ht-apps">
        {b.apps.map((a) => (a.view
          ? (
            <a key={a.key} className={`ht-app${a.best ? ' is-best' : ''}`} href={a.view.href}
               onClick={(e) => open(e, a.view.href)}
               target={isWeb(a.view.href) ? '_blank' : undefined} rel={isWeb(a.view.href) ? 'noreferrer' : undefined}>
              <small>{a.label}</small>{a.view.amount}
            </a>
          )
          : <span key={a.key} className="ht-app ht-app--none"><small>{a.label}</small>-</span>))}
      </div>
    </li>
  )
}

export default function HeroTrustShell() {
  const { loading, error, brands, filters } = useHeroTrustData()
  const [category, setCategory] = useState(null)
  const list = useMemo(() => listFor(brands, filters, category), [brands, filters, category])
  const shown = list.filter((b) => b.rep)
  const [first, ...rest] = shown
  return (
    <main className="ht-shell">
      <header className="ht-top"><h1>오늘의 할인</h1></header>
      <div className="ht-cats" role="group" aria-label="분류">
        <button type="button" className={category == null ? 'is-on' : ''} onClick={() => setCategory(null)}>전체</button>
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={category === c.key ? 'is-on' : ''} onClick={() => setCategory(c.key)}>{c.label}</button>
        ))}
      </div>
      {loading && <BrandGridSkeleton />}
      {error && <p className="ht-msg">할인 정보를 불러오지 못했어요.</p>}
      {first && <Hero b={first} />}
      {rest.length > 0 && <ul className="ht-list">{rest.map((b) => <Row key={b.name} b={b} />)}</ul>}
    </main>
  )
}
