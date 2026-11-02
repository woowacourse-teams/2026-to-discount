import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FeedCard, { clock, linkProps, onOpen } from './FeedCard.jsx'
import { CATEGORIES, cardsFor, loadFeed, loadHubLinks, newestCaptured } from './data.js'
import './feed.css'

export default function FeedShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [category, setCategory] = useState(null)
  const [activeKey, setActiveKey] = useState(null)
  const listRef = useRef(null)

  const load = useCallback(() => {
    setFailed(false)
    setBrands(null)
    loadFeed().then(setBrands).catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
    loadHubLinks()
  }, [load])

  const all = useMemo(() => (brands ? cardsFor(brands) : []), [brands])
  const cards = useMemo(
    () => (brands ? cardsFor(brands, new Set(category ? [category] : [])) : []),
    [brands, category],
  )
  const newest = newestCaptured(all)

  // 화면 가운데에 가장 가까운 카드를 하단 버튼이 따라간다. 관찰 실패(미지원)면 첫 카드.
  useEffect(() => {
    setActiveKey(cards[0]?.key ?? null)
    const root = listRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver((entries) => {
      const hit = entries.find((en) => en.isIntersecting)
      if (hit) setActiveKey(hit.target.getAttribute('data-feed-key'))
    }, { rootMargin: '-45% 0px -45% 0px' })
    root.querySelectorAll('[data-feed-key]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [cards])

  const active = cards.find((c) => c.key === activeKey) ?? cards[0]

  return (
    <div className="feed">
      <header className="feed-head">
        <h1>오늘의 배달 할인</h1>
        {newest && <span className="feed-head__time">{clock(newest)} 기준</span>}
      </header>
      <nav className="feed-cats" aria-label="분류">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={category === c.key ? 'is-on' : ''}
            aria-pressed={category === c.key}
            onClick={() => setCategory(category === c.key ? null : c.key)}
          >{c.label}</button>
        ))}
      </nav>
      <main className="feed-list" ref={listRef}>
        {failed && (
          <div className="feed-state" role="alert">
            <p>할인 목록을 불러오지 못했어요.</p>
            <button type="button" onClick={load}>다시 시도</button>
          </div>
        )}
        {!failed && !brands && [0, 1, 2].map((i) => <div key={i} className="feed-card feed-card--skeleton" aria-hidden="true" />)}
        {!failed && brands && cards.length === 0 && (
          <div className="feed-state">
            <p>이 분류에 보여줄 할인이 없어요.</p>
            <button type="button" onClick={() => setCategory(null)}>분류 해제</button>
          </div>
        )}
        {cards.map((c) => <FeedCard key={c.key} card={c} />)}
      </main>
      <div className="feed-bar">
        {active && active.href ? (
          <a className="feed-bar__btn" {...linkProps(active.href)} onClick={onOpen(active)}>
            {active.name} {active.amount} 받으러 가기
          </a>
        ) : (
          <span className="feed-bar__btn is-off">{active ? `${active.name} 링크 없음` : '받으러 가기'}</span>
        )}
      </div>
    </div>
  )
}
