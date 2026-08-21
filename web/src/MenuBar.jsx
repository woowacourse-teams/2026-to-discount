import { useEffect, useRef, useState } from 'react'
import { CATEGORIES } from './filters.js'

/**
 * 스크롤을 내리면 타이틀바 자리에 남아 따라오는 선형 메뉴바(카테고리바).
 *
 * <p>분류를 한 줄로 늘어놓고 고른 것마다 하이라이트를 얹는다. 예전에는
 * 판 하나를 JS가 버튼 실측해 clip-path 사다리꼴로 그리고 선택한 탭으로
 * 미끄러뜨렸는데, 분류가 복수 선택이 되면서 그 판이 어디로 가야 하는지
 * 정의가 없어졌다. 버튼마다 자기 배경을 직접 그리면 복수 선택이 그대로
 * 성립하고 실측 로직도 통째로 사라진다 — 미끄러지는 맛은 잃지만 규칙이
 * 단순해진다.
 *
 * <p>여기서 누른 건 바로 반영한다. 시트는 여러 조건을 한 번에 바꾸는
 * 자리라 "적용"이 필요하지만, 메뉴바는 분류 하나를 빠르게 켜고 끄는
 * 자리다 — 여기까지 적용 버튼을 요구하면 손이 두 번 간다.
 *
 * <p>필터 버튼은 상단 바에 있다. 여기에도 두면 같은 문을 두 개 만드는
 * 셈이라, 분류만 남긴다.
 */
export default function MenuBar({ selected, onToggle }) {
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
