import { useEffect, useState } from 'react'
import { track } from './analytics.js'
import { BrandLogo } from './logos.jsx'
import { bestConfirmedAmount } from './filters.js'
import { readRecent } from './recentBrands.js'

/**
 * 최근 띠(2026-10-14 시안). 이 기기에서 할인 링크나 배너를 누른 브랜드를 최근 순으로 쌓아
 * 로고, 이름, 지금 최고 할인만 보인다. 분류 탭으로 숨겨 두면 티가 안 나서(사용자) 첫 화면 띠로 둔다.
 * 누른 적이 없으면 그리지 않는다. 배달앱에 갔다 돌아오면(visibilitychange) 다시 읽는다.
 */
export default function RecentStrip({ brands, onPick }) {
  const [names, setNames] = useState(readRecent)
  useEffect(() => {
    const reload = () => { if (document.visibilityState === 'visible') setNames(readRecent()) }
    document.addEventListener('visibilitychange', reload)
    return () => document.removeEventListener('visibilitychange', reload)
  }, [])
  const byName = new Map((brands ?? []).map((b) => [b.name, b]))
  const items = names.map((n) => byName.get(n)).filter(Boolean).slice(0, 10)
  if (items.length === 0) return null
  return (
    <section className="recent-strip" aria-label="최근">
      <h2 className="recent-strip__title">최근</h2>
      <ol className="recent-strip__list">
        {items.map((b, i) => {
          const amount = bestConfirmedAmount(b.offers)
          return (
            <li key={b.name}>
              <button
                type="button"
                className="recent-strip__item"
                onClick={() => { onPick(b.name); track('quick_filter', { key: 'recent_strip', brand: b.name, position: i + 1 }) }}
              >
                <BrandLogo name={b.name} size={22} />
                <span className="recent-strip__name">{b.shortName ?? b.name}</span>
                {amount != null && <span className="recent-strip__amount">{amount.toLocaleString('ko-KR')}원</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
