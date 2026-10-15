import { useEffect, useState } from 'react'
import { track } from './analytics.js'
import { BrandLogo } from './logos.jsx'
import { RankChange } from './PopularStrip.jsx'
import { STRIP_MIN, popularToday } from './popularStrip.js'

const ROLL_MS = 3500

/**
 * 하단 오늘 인기(2026-10-15 사용자: 배너 도크 자리를 인기 순위로). 위 띠가 화면 밖으로 나가면 오른쪽 아래에
 * 한 줄로 떠서 1~5위를 차례로 굴린다(실검 꼴). 누르면 다섯 줄로 펼치고, 한 줄을 누르면 그 카드로 간다.
 * 근거: 10-14 17:25 이후 띠는 본 방문자 약 10%가 눌렀고 배너는 약 2%(PostHog, 백로그 "배너를 리스트 안으로").
 */
export default function PopularDock({ brands, onPick, stripSelector = '.pop-strip' }) {
  const top = popularToday(brands)
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)

  // 위 띠가 보이는 동안은 숨는다. 띠가 없으면(세 곳 미만) 독도 없다.
  useEffect(() => {
    const strip = document.querySelector(stripSelector)
    if (!strip || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => { setShown(!e.isIntersecting); if (e.isIntersecting) setOpen(false) })
    io.observe(strip)
    return () => io.disconnect()
  }, [stripSelector, top.length])

  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (open || !shown || reduce || top.length < 2) return undefined
    // 탭이 가려져 있으면 굴리지 않는다
    const t = setInterval(() => { if (!document.hidden) setI((n) => (n + 1) % top.length) }, ROLL_MS)
    return () => clearInterval(t)
  }, [open, shown, reduce, top.length])

  if (top.length < STRIP_MIN) return null
  const cur = top[i % top.length]
  const pick = (row, where) => {
    setOpen(false)
    onPick(row.brand.name)
    track('quick_filter', { key: 'popular_dock', brand: row.brand.name, position: row.rank, change: row.change, where })
  }
  return (
    <aside className={`pop-dock${shown ? ' pop-dock--shown' : ''}${open ? ' pop-dock--open' : ''}`} aria-label="오늘 인기">
      {open && (
        <ol className="pop-dock__list">
          {top.map((row) => (
            <li key={row.brand.name}>
              <button type="button" className="pop-dock__row" onClick={() => pick(row, 'list')}>
                <span className="pop-dock__rank">{row.rank}</span>
                <BrandLogo name={row.brand.name} size={20} />
                <span className="pop-dock__name">{row.brand.shortName ?? row.brand.name}</span>
                <RankChange change={row.change} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="pop-dock__bar"
        aria-expanded={open}
        aria-label={`오늘 인기 순위 ${open ? '접기' : '펼치기'}`}
        onClick={() => { setOpen((o) => !o); track('quick_filter', { key: 'popular_dock_toggle', on: !open }) }}
      >
        <span className="pop-dock__label">오늘 인기</span>
        <span className="pop-dock__tick" key={cur.brand.name} aria-hidden="true">
          <span className="pop-dock__rank">{cur.rank}</span>
          <span className="pop-dock__name">{cur.brand.shortName ?? cur.brand.name}</span>
          <RankChange change={cur.change} />
        </span>
        <span className="pop-dock__caret" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
    </aside>
  )
}
