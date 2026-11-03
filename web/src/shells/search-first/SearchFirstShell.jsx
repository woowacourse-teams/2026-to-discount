// 홈 리뉴얼 시안 - 검색 먼저(#255). 병합하지 않는 시안. 데이터와 계산은 기존 모듈을 data.js로 읽는다.
import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { setHubLinks, openWithNotice } from '../../offerLink.js'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { cardOf, frequentBrands, searchBrands } from './data.js'
import './shell.css'

function stamp(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function AppCell({ app }) {
  const { platform, state, link } = app
  const web = typeof link === 'string' && link.startsWith('http')
  return (
    <li className={`sf-app sf-app--${state}`}>
      <PlatformBadge platformKey={platform.key} />
      <span className="sf-app__name">{platform.label}</span>
      <strong className="sf-app__amt">{app.text}</strong>
      {app.minText && <span className="sf-app__min">{app.minText}</span>}
      {link ? (
        <a className="sf-app__go" href={link} target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
           aria-label={`${platform.label} ${app.text}, 앱으로 이동`}
           onClick={(e) => openWithNotice(e, link, { offerPrompt: true })}>쿠폰 받기</a>
      ) : (
        <button className="sf-app__go" type="button" disabled>{state === 'none' ? '없음' : '링크 없음'}</button>
      )}
    </li>
  )
}

function Card({ brand }) {
  const card = useMemo(() => cardOf(brand), [brand])
  const when = card.checkedAt ? stamp(card.checkedAt) : null
  return (
    <article className="sf-card">
      <header className="sf-card__head">
        <BrandLogo name={card.name} />
        <div className="sf-card__title">
          <h2>{card.name}</h2>
          {card.headChips.length > 0 && (
            <span className="sf-chips">
              {card.headChips.map((c) => <span key={`${c.kind}-${c.text}`} className="sf-chip">{c.text}</span>)}
            </span>
          )}
        </div>
        <p className="sf-card__amt">
          {card.amount != null ? <>{card.amount.toLocaleString('ko-KR')}<small>원 할인</small></> : card.amountFallback}
        </p>
      </header>
      <ul className="sf-apps">
        {card.apps.map((a) => <AppCell key={a.platform.key} app={a} />)}
      </ul>
      {when && <p className="sf-card__when">{when} 기준</p>}
    </article>
  )
}

export default function SearchFirstShell() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(false)
    fetchBanners().then((b) => { if (alive) setHubLinks(b) }).catch(() => { /* 배너는 부가 정보 */ })
    fetchBrands().then((b) => { if (alive) setBrands(b) }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [attempt])

  const chips = useMemo(() => (brands ? frequentBrands(brands) : []), [brands])
  const results = useMemo(() => (brands && query.trim() ? searchBrands(brands, query) : []), [brands, query])
  const searching = query.trim() !== ''

  return (
    <main className="sf">
      <h1 className="sf__title">오늘 어디서 할인받을까요</h1>
      <div className="sf-search">
        <input className="sf-search__input" type="search" value={query} placeholder="브랜드, 메뉴 검색"
               aria-label="브랜드 검색" onChange={(e) => setQuery(e.target.value)} />
        {query && <button className="sf-search__clear" type="button" aria-label="지우기" onClick={() => setQuery('')}>×</button>}
      </div>

      {error && (
        <p className="sf__msg">불러오지 못했어요 <button type="button" onClick={() => setAttempt((n) => n + 1)}>다시 시도</button></p>
      )}
      {!brands && !error && <p className="sf__msg">불러오는 중</p>}

      {brands && searching && results.map((b) => <Card key={b.name} brand={b} />)}
      {brands && searching && results.length === 0 && <p className="sf__msg">찾는 브랜드가 없어요</p>}

      {brands && (!searching || results.length === 0) && (
        <section className="sf-freq" aria-label="자주 찾는 브랜드">
          <h2>자주 찾는 브랜드</h2>
          <ul>
            {chips.map((b) => (
              <li key={b.name}>
                <button type="button" className="sf-freq__chip" onClick={() => setQuery(b.name)}>
                  <BrandLogo name={b.name} /><span>{b.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
