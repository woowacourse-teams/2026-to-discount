import { useEffect, useMemo, useState } from 'react'
import Sheet from './Sheet.jsx'
import { agoText, defaultFilters, homeView, load } from './data.js'
import './bottom-sheet.css'

const EMPTY = { cards: [], count: 0, hot: null, captured: null }

// 홈 리뉴얼 시안: 아래 시트 필터(#237). 병합하지 않는 시안이다.
export default function BottomSheetShell() {
  const [brands, setBrands] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error (실패와 0건을 가른다)
  const [filters, setFilters] = useState(defaultFilters)

  useEffect(() => {
    let alive = true
    load()
      .then((b) => { if (alive) { setBrands(Array.isArray(b) ? b : []); setState(Array.isArray(b) ? 'ready' : 'error') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [])

  const view = useMemo(() => (brands ? homeView(brands, filters) : EMPTY), [brands, filters])
  const ago = agoText(view.captured)

  return (
    <main className="bs-shell">
      <header className="bs-top">
        <div className="bs-top__nums">
          <div>
            <small>보이는 브랜드</small>
            <strong>{state === 'ready' ? view.count : '-'}</strong>
          </div>
          <div>
            <small>오늘 인기 1위</small>
            <strong>{view.hot ? view.hot.name : '-'}</strong>
            {view.hot?.amount != null && <span>{view.hot.amount.toLocaleString('ko-KR')}원</span>}
          </div>
        </div>
        <p className="bs-top__ago">{ago ? `${ago} 갱신` : ''}</p>
      </header>
      <Sheet view={view} brands={brands} filters={filters} setFilters={setFilters} state={state} />
    </main>
  )
}
