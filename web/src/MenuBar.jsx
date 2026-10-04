import { useEffect, useRef, useState } from 'react'
import { CATEGORIES } from './filters.js'

// 분류 메뉴 바(상단 바 B안의 2줄). 2026-09 화면 실험 B안에서 되살림(1e9a40f에서 지운 파일).
// 누르면 바로 반영한다. 고른 분류는 버튼마다 자기 배경을 그린다.
export default function MenuBar({ selected, onToggle, leading = [] }) {
  const listRef = useRef(null)
  // 어느 쪽으로 더 갈 수 있는지. 양쪽 화살표를 늘 켜두면 끝에 닿았는데도
  // 더 있는 것처럼 보인다.
  const [more, setMore] = useState({ left: false, right: false })

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const update = () => setMore({
      left: el.scrollLeft > 4,
      // clientWidth 0은 바가 아직 접혀 있다는 뜻이다 — 안 보이는 바에
      // 화살표를 켜두면 펼쳐지는 순간 한 프레임 잘못 뜬다.
      right: el.clientWidth > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
    update()
    el.addEventListener('scroll', update, { passive: true })
    // 분류가 늘거나 화면 폭이 바뀌면 넘칠지 여부도 달라진다.
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])

  return (
    <nav className="menu-bar" aria-label="분류 메뉴">
      <div className="menu-bar__inner">
        {/* 옆으로 더 있다는 표시. 가로 스크롤은 화면에 흔적이 안 남아서
            분류가 잘린 줄 모르고 지나친다. 장식이라 스크린리더에서는 뺀다. */}
        <span className={`menu-bar__more menu-bar__more--left${more.left ? ' menu-bar__more--on' : ''}`} aria-hidden="true">‹</span>
        <span className={`menu-bar__more menu-bar__more--right${more.right ? ' menu-bar__more--on' : ''}`} aria-hidden="true">›</span>
        <ul className="menu-bar__list" ref={listRef}>
          {/* 분류 앞에 서는 보기(전체, 신규). 분류와 같은 꼴이고 하나만 켜진다 */}
          {leading.map((l) => (
            <li key={l.key}>
              <button type="button" className={`menu-bar__item${l.on ? ' menu-bar__item--on' : ''}`} aria-pressed={l.on} onClick={l.onClick}>
                {l.label}
              </button>
            </li>
          ))}
          {CATEGORIES.map((c) => {
            const on = selected.has(c.key)
            return (
              <li key={c.key}>
                <button
                  type="button"
                  className={`menu-bar__item${on ? ' menu-bar__item--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onToggle(c.key)}
                >
                  {c.label}
                </button>
              </li>
            )
          })}
        </ul>

      </div>
    </nav>
  )
}
