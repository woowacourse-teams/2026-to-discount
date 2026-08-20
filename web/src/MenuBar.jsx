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
  return (
    <nav className="menu-bar" aria-label="분류 메뉴">
      <div className="menu-bar__inner">
        <ul className="menu-bar__list">
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
