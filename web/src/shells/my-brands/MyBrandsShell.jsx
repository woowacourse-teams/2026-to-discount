// 홈 리뉴얼 시안 "내 브랜드"(#240). 버리는 시안이다. 문구는 프리뷰 승인 때 확정한다(설계 4-5).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { CATEGORIES, cardOf, loadHome, orderedBrands, recommendedBrands } from './data.js'
import './my-brands.css'

const KEY = 'dk_my_brands_shell'

function readStars() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

// 첫 렌더는 별표 없음. 저장소는 effect에서만 읽는다.
function useStars() {
  const [stars, setStars] = useState([])
  useEffect(() => { setStars(readStars()) }, [])
  const toggle = useCallback((name) => {
    setStars((cur) => {
      const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
      try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)) } catch { /* 저장 못 해도 이번 방문은 화면 상태로 산다 */ }
      return next
    })
  }, [])
  return [stars, toggle]
}

function clock(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d.toDateString() === new Date().toDateString()) return hm
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function Star({ on, name, onToggle }) {
  return (
    <button type="button" className={`mb-star${on ? ' mb-star--on' : ''}`} aria-pressed={on}
            aria-label={`${name} 별표`} onClick={() => onToggle(name)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z" /></svg>
    </button>
  )
}

function Card({ brand, starred, onToggle }) {
  const c = cardOf(brand)
  if (!c.offer) return null
  const web = c.href?.startsWith('http')
  const at = c.capturedAt && clock(c.capturedAt)
  return (
    <article className="mb-card">
      <div className="mb-card__top">
        <BrandLogo name={brand.name} size={40} />
        <strong className="mb-card__name">{c.name}</strong>
        <Star on={starred} name={brand.name} onToggle={onToggle} />
      </div>
      <div className="mb-card__big">
        <span className={`mb-amt${c.soldOut ? ' mb-amt--sold' : ''}`}>{c.amount}</span>
        {c.soldOut && <em className="mb-sold">품절</em>}
        <span className="mb-app">{c.platform}{c.channel ? ` · ${c.channel}` : ''}</span>
      </div>
      <div className="mb-card__cond">
        {c.chips.map((t) => <span key={t} className="mb-chip">{t}</span>)}
        <span className="mb-min">{c.min}</span>
      </div>
      {at && <div className="mb-card__at">{at} 확인</div>}
      {c.href && (
        <a className="mb-go" href={c.href} target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
           aria-label={`${brand.name} ${c.amount}, 앱으로 이동`}
           onClick={(e) => openWithNotice(e, c.href, { offerPrompt: true })}>쿠폰 받으러 가기</a>
      )}
    </article>
  )
}

function Row({ brand, starred, onToggle }) {
  const c = cardOf(brand)
  return (
    <li className="mb-row">
      <BrandLogo name={brand.name} size={32} />
      <span className="mb-row__name">{c.name ?? brand.name}</span>
      <span className="mb-row__amt">{c.offer ? c.amount : '-'}</span>
      <Star on={starred} name={brand.name} onToggle={onToggle} />
    </li>
  )
}

function Skeleton() {
  return <div className="mb-list" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="mb-card mb-card--skel" />)}</div>
}

export default function MyBrandsShell() {
  const [state, setState] = useState({ status: 'loading' })
  const [category, setCategory] = useState(null)
  const [stars, toggle] = useStars()

  const load = useCallback(() => {
    setState({ status: 'loading' })
    loadHome().then((home) => setState({ status: 'ok', ...home })).catch(() => setState({ status: 'error' }))
  }, [])
  useEffect(() => { load() }, [load])

  const brands = state.brands
  const mine = useMemo(() => {
    if (!brands) return []
    const byName = new Map(brands.map((b) => [b.name, b]))
    return stars.map((n) => byName.get(n)).filter(Boolean) // 내려간 브랜드는 조용히 건너뛴다
  }, [brands, stars])
  const recommended = useMemo(() => (brands && mine.length === 0 ? recommendedBrands(brands) : []), [brands, mine.length])
  const all = useMemo(() => (brands ? orderedBrands(brands, category) : []), [brands, category])
  const shown = mine.length > 0 ? mine : recommended
  const checked = state.checkedAt && clock(state.checkedAt)

  return (
    <main className="mb">
      <header className="mb-head">
        <h1>내 브랜드</h1>
        {checked && <p className="mb-head__sub">마지막 확인 {checked}</p>}
      </header>
      {state.status === 'loading' && <Skeleton />}
      {state.status === 'error' && (
        <div className="mb-error">
          <p>불러오지 못했어요.</p>
          <button type="button" onClick={load}>다시 시도</button>
        </div>
      )}
      {state.status === 'ok' && (
        <>
          <section>
            <h2>{mine.length > 0 ? '내 브랜드' : '지금 인기 브랜드'}</h2>
            {mine.length === 0 && <p className="mb-hint">별표를 누르면 여기에 모여요</p>}
            <div className="mb-list">
              {shown.map((b) => <Card key={b.name} brand={b} starred={stars.includes(b.name)} onToggle={toggle} />)}
            </div>
          </section>
          <section>
            <h2>전체 브랜드</h2>
            <div className="mb-cats" role="group" aria-label="분류">
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" aria-pressed={category === c.key}
                        className={`mb-cat${category === c.key ? ' mb-cat--on' : ''}`}
                        onClick={() => setCategory(category === c.key ? null : c.key)}>{c.label}</button>
              ))}
            </div>
            <ul className="mb-rows">
              {all.map((b) => <Row key={b.name} brand={b} starred={stars.includes(b.name)} onToggle={toggle} />)}
            </ul>
          </section>
        </>
      )}
    </main>
  )
}
