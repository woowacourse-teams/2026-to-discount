import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
      <BrandLogo name={row.brand.name} size={26} />
      <span className="pop-dock__name">{row.brand.shortName ?? row.brand.name}</span>
      <span className="pop-dock__amount">{amount == null ? '' : `${amount.toLocaleString('ko-KR')}원`}</span>
    </>
  )
}

/**
 * 인기 브랜드(2026-10-15 사용자: 배너 도크 자리를 인기 순위로, 2026-10-17 상단 바의 검색과 분류 사이로). 한 덩어리다.
 * 접혀 있으면 한 줄에서 1~5위를 차례로 굴린다(실검 꼴). 줄(순위, 로고, 이름, 금액)을 누르면 그 카드로 가고,
 * 오른쪽 펼치기 단추만 펼친다(2026-10-17 사용자). 펼치면 바 아래로 화면 폭을 다 쓰는 판이 열리고 보이던 브랜드가
 * 제 순위 자리로 미끄러진다. 뒤는 옅게 가린다(네이버·다음 실검, 무신사 인기 검색어 펼침 꼴). 바깥을 누르면 접힌다.
 * 근거: 10-14 17:25 이후 띠는 본 방문자 약 6%가 눌렀고 배너는 약 4%(PostHog, 2026-10-17 조회).
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
    const close = (e) => {
      if (ref.current?.contains(e.target)) return
      setOpen(false)
      track('quick_filter', { key: 'popular_dock_toggle', on: false, via: 'outside' })
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  // 노출: 페이지마다 한 번, 그때 1위와 줄 수(2026-10-17 사용자: 이벤트 싹 붙이기)
  const seen = useRef(false)
  useEffect(() => {
    if (seen.current || top.length < STRIP_MIN) return
    seen.current = true
    track('popular_dock_impression', { brand: top[0].brand.name, count: top.length })
  }, [top])

  if (top.length < STRIP_MIN) return null
  const cur = i % top.length
  const toggle = () => { setOpen(!open); track('quick_filter', { key: 'popular_dock_toggle', on: !open, via: 'button' }) }
  const pick = (row, where) => {
    setOpen(false)
    onPick(row.brand.name)
    track('quick_filter', { key: 'popular_dock', brand: row.brand.name, position: row.rank, change: row.change, where })
  }
  return (
    <>
      {/* 상단 바는 transform이 있어 그 안의 fixed가 바에 갇힌다. 가림막은 body로 내보내 바(z 60) 바로 밑에 깐다 */}
      {open && createPortal(<div className="pop-dock__dim" aria-hidden="true" />, document.body)}
      <aside ref={ref} className={`pop-dock${open ? ' pop-dock--open' : ''}`} style={{ '--rows': top.length }} aria-label="인기 브랜드">
        <span className="pop-dock__label"><span aria-hidden="true">🔥</span>HOT</span>
        <ol className="pop-dock__list">
          {top.map((row, n) => {
            const on = open || n === cur
            return (
              <li key={row.brand.name} className={`pop-dock__item${on ? ' is-on' : ''}`} style={{ '--slot': open ? n + 1 : 0 }} aria-hidden={!on}>
                <button type="button" className="pop-dock__row" tabIndex={on ? 0 : -1} aria-label={`${row.rank}위 ${row.brand.name} 카드로 가기`}
                  onClick={() => pick(row, open ? 'list' : 'rolling')}>
                  <Cells row={row} />
                </button>
              </li>
            )
          })}
        </ol>
        <button type="button" className="pop-dock__more" aria-expanded={open} aria-label={open ? '인기 브랜드 접기' : '인기 브랜드 펼치기'} onClick={toggle}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </aside>
    </>
  )
}