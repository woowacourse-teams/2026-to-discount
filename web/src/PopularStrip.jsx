import { track } from './analytics.js'
import { BrandLogo } from './logos.jsx'
import { STRIP_MIN, popularToday } from './popularStrip.js'

/** 등락 표시. 글자 대신 화살표와 숫자만(새 문구 없이). 그 전 순위에 없던 브랜드는 화살표만. */
export function RankChange({ change }) {
  if (change === 0) return <span className="rank-change rank-change--same" aria-label="순위 그대로">-</span>
  if (change == null) return <span className="rank-change rank-change--up" aria-label="새로 순위에 듦">▲</span>
  const up = change > 0
  return (
    <span className={`rank-change rank-change--${up ? 'up' : 'down'}`} aria-label={`${Math.abs(change)}계단 ${up ? '오름' : '내림'}`}>
      {up ? '▲' : '▼'}{Math.abs(change)}
    </span>
  )
}

export default function PopularStrip({ brands, onPick }) {
  const top = popularToday(brands)
  if (top.length < STRIP_MIN) return null
  return (
    <section className="pop-strip" aria-label="오늘 인기">
      <h2 className="pop-strip__title">오늘 인기</h2>
      <ol className="pop-strip__list">
        {top.map(({ brand: b, rank, change }) => (
          <li key={b.name}>
            <button
              type="button"
              className="pop-strip__item"
              onClick={() => { onPick(b.name); track('quick_filter', { key: 'popular_strip', brand: b.name, position: rank, change }) }}
            >
              <span className="pop-strip__rank">{rank}</span>
              <BrandLogo name={b.name} size={22} />
              <span className="pop-strip__name">{b.shortName ?? b.name}</span>
              <RankChange change={change} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
