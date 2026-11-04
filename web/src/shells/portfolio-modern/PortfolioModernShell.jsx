import { useEffect, useMemo, useState } from 'react'
import { fetchBanners, fetchBrands } from '../../api.js'
import { setHubLinks } from '../../offerLink.js'
import { CATEGORIES, buildHome } from './data.js'
import './portfolio-modern.css'

// 갱신 시각 글자. 어댑터는 값 그대로 넘기고 글자 변환은 여기 한 곳.
function agoText(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const min = Math.max(0, Math.floor((now - t) / 60000))
  if (min < 1) return '방금 갱신'
  if (min < 60) return `${min}분 전 갱신`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전 갱신`
  return `${Math.floor(hour / 24)}일 전 갱신`
}

function Card({ card }) {
  return (
    <li className="pm-card">
      <a className="pm-card__main" href={card.href} target="_blank" rel="noopener noreferrer">
        <div className="pm-card__head">
          {card.logo && <img className="pm-card__logo" src={card.logo} alt="" width="40" height="40" loading="lazy" />}
          <div className="pm-card__who">
            <strong className="pm-card__name">{card.name}</strong>
            <span className="pm-card__app">{card.app}</span>
          </div>
        </div>
        <div className="pm-card__amount">{card.amount}</div>
        {card.chips.length > 0 && (
          <div className="pm-card__chips">
            {card.chips.map((c, i) => <span key={`${c.kind}-${i}`} className="pm-chip">{c.text}</span>)}
          </div>
        )}
        <div className="pm-card__min">{card.min}</div>
      </a>
      <div className="pm-card__foot">
        <ul className="pm-card__apps">
          {card.apps.map((a) => (
            <li key={a.key} className={a.none ? 'is-none' : ''}>{a.label} {a.amount}</li>
          ))}
        </ul>
        <a className="pm-card__go" href={card.href} target="_blank" rel="noopener noreferrer">받으러 가기</a>
      </div>
    </li>
  )
}

export default function PortfolioModernShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [cats, setCats] = useState([])

  useEffect(() => {
    let alive = true
    // 쿠팡이츠 허브 링크는 배너로 정해진다. 배너가 실패해도 브랜드는 그린다.
    fetchBanners().then(setHubLinks).catch(() => {}).then(() => fetchBrands())
      .then((b) => { if (alive) setBrands(b) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const home = useMemo(() => (brands ? buildHome(brands, cats) : null), [brands, cats])
  const toggle = (key) => setCats((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]))

  if (failed) return <main className="pm"><p className="pm-state">목록을 불러오지 못했어요. 새로고침해 주세요.</p></main>
  if (!home) return <main className="pm"><p className="pm-state">불러오는 중</p></main>

  const { summary } = home
  const ago = home.updatedAt ? agoText(home.updatedAt) : null
  const third = summary.popular
    ? { label: '오늘 인기 1위', value: summary.popular, sub: '' }
    : { label: '비교하는 앱', value: `${summary.appCount}곳`, sub: '' }

  return (
    <main className="pm">
      <header className="pm-top">
        <p className="pm-overline">오늘의 할인</p>
        <h1 className="pm-title">배달앱 쿠폰, 한눈에 비교</h1>
        <div className="pm-stats">
          <div className="pm-stat">
            <span className="pm-stat__label">브랜드</span>
            <strong className="pm-stat__num">{summary.count}곳</strong>
          </div>
          {summary.top ? (
            <div className="pm-stat">
              <span className="pm-stat__label">최고 할인</span>
              <strong className="pm-stat__num">{summary.top.amount}</strong>
              <span className="pm-stat__sub">{summary.top.brand}</span>
            </div>
          ) : (
            <div className="pm-stat">
              <span className="pm-stat__label">비교하는 앱</span>
              <strong className="pm-stat__num">{summary.appCount}곳</strong>
            </div>
          )}
          <div className="pm-stat">
            <span className="pm-stat__label">{third.label}</span>
            <strong className="pm-stat__num pm-stat__num--text">{third.value}</strong>
          </div>
        </div>
        {ago && <p className="pm-trust">{ago}</p>}
      </header>

      <nav className="pm-cats" aria-label="분류">
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={`pm-cat${cats.includes(c.key) ? ' is-on' : ''}`}
            aria-pressed={cats.includes(c.key)} onClick={() => toggle(c.key)}>{c.label}</button>
        ))}
      </nav>

      <ul className="pm-list">
        {home.cards.map((card) => <Card key={card.name} card={card} />)}
      </ul>
    </main>
  )
}
