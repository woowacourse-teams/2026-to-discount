import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { BrandLogo } from './logos.jsx'
import { RankChange } from './PopularStrip.jsx'
import { STRIP_MIN, popularToday } from './popularStrip.js'
import { bestConfirmedAmount } from './filters.js'

const ROLL_MS = 5500 // 2026-10-16 사용자: 넘어가는 시간을 늘려(3.5초 -> 5.5초)

// 한 줄: 증감(작게), 로고, 이름(넘치면 ...), 최고 할인. 목록과 굴림 줄이 같은 칸을 쓴다(2026-10-15 사용자)
function Cells({ row }) {
  const amount = bestConfirmedAmount(row.brand.offers ?? [])
  return (
    <>
      {/* 순위 옆에 등락, 그대로면 순위만(2026-10-16 사용자) */}
      <span className="pop-dock__change"><span className="pop-dock__rank" aria-label={`${row.rank}위`}>{row.rank}</span>{row.change !== 0 && <RankChange change={row.change} />}</span>
      <BrandLogo name={row.brand.name} size={32} />
      <span className="pop-dock__name">{row.brand.shortName ?? row.brand.name}</span>
      <span className="pop-dock__amount">{amount == null ? '' : `${amount.toLocaleString('ko-KR')}원`}</span>
    </>
  )
}

/**
 * 하단 인기 브랜드(2026-10-15 사용자: 배너 도크 자리를 인기 순위로). 한 덩어리다. 접혀 있을 때는 한 줄만 보이며
 * 1~5위를 차례로 굴리고(실검 꼴), 누르면 위로 다섯 줄 높이로 펼쳐지며 보이던 브랜드가 제 순위 자리로 미끄러진다.
 * 카드로 가는 것은 바로가기 아이콘뿐이고, 줄의 나머지는 펼치고 접는다(2026-10-16 사용자). 바깥을 눌러도 접힌다.
 * 근거: 10-14 17:25 이후 띠는 본 방문자 약 10%가 눌렀고 배너는 약 2%(PostHog, 백로그 "배너를 리스트 안으로").
 */
export default function PopularDock({ brands, onPick }) {
  const top = popularToday(brands)
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (open || reduce || top.length < 2) return undefined
    // 탭이 가려져 있으면 굴리지 않는다
    const t = setInterval(() => { if (!document.hidden) setI((n) => (n + 1) % top.length) }, ROLL_MS)
    return () => clearInterval(t)
  }, [open, reduce, top.length])

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (top.length < STRIP_MIN) return null
  const cur = i % top.length
  const toggle = () => { setOpen(!open); track('quick_filter', { key: 'popular_dock_toggle', on: !open }) }
  const pick = (row, where = 'list') => {
    setOpen(false)
    onPick(row.brand.name)
    track('quick_filter', { key: 'popular_dock', brand: row.brand.name, position: row.rank, change: row.change, where })
  }
  return (
    <aside ref={ref} className={`pop-dock${open ? ' pop-dock--open' : ''}`} style={{ '--rows': open ? top.length : 1 }} aria-label="인기 브랜드">
      <span className="pop-dock__label" aria-hidden="true">인기 브랜드</span>
      <ol className="pop-dock__list">
        {top.map((row, n) => {
          const on = open || n === cur
          return (
            <li key={row.brand.name} className={`pop-dock__item${on ? ' is-on' : ''}`} style={{ '--slot': open ? n : 0 }} aria-hidden={!on}>
              <button
                type="button"
                className="pop-dock__row"
                tabIndex={on ? 0 : -1}
                aria-label={open ? '인기 브랜드 접기' : '인기 브랜드 펼치기'}
                aria-expanded={open}
                onClick={toggle}
              >
                <Cells row={row} />
              </button>
              {/* 바로가기: 이것만 그 카드로 가고 줄의 나머지는 펼친다(2026-10-16 사용자) */}
              <button type="button" className="pop-dock__go" tabIndex={on ? 0 : -1} aria-label={`${row.brand.name} 카드로 가기`}
                onClick={() => pick(row, open ? 'list' : 'rolling')}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3.5h6.5V10M12.5 3.5 4 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
