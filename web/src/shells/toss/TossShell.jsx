import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import TopBarB from '../../TopBarB.jsx'
import { track } from '../../analytics.js'
import { defaultFilters, isDefaultFilters, minAmountLabel, primarySort, readMinAmount, saveMinAmount } from '../../filters.js'
import { loadBrands, toRows } from './data.js'
import './toss.css'

const FilterSheet = lazy(() => import('../../FilterSheet.jsx'))

// 타이틀바는 기존 홈과 같이 fixed다. 높이를 재어 스페이서가 대신 차지하게 한다(App.jsx와 같은 방식).
function useBarHeight(ref) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (h) => {
      document.documentElement.style.setProperty('--bar-h', `${h}px`)
      document.documentElement.dataset.bar = '1'
    }
    const ro = new ResizeObserver(([entry]) => set(entry.target.getBoundingClientRect().height))
    ro.observe(el)
    set(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [ref])
}

// 시트에서 고른 기준 금액은 이 브라우저에 남는다. 없으면 기본값(App.jsx와 같은 규칙).
const readSaved = () => {
  const n = readMinAmount()
  return n ? { ...defaultFilters(), minAmount: n } : defaultFilters()
}

export default function TossShell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const [filters, setFilters] = useState(readSaved)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const barRef = useRef(null)
  const pushToggleRef = useRef(null)
  useBarHeight(barRef)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let alive = true
    setFailed(false)
    setBrands(null)
    loadBrands(tries === 0 ? window.__SSR__ : null)
      .then((v) => { if (alive) setBrands(v) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [tries])

  const rows = useMemo(() => (brands ? toRows(brands, filters) : []), [brands, filters])
  const setSearch = (v) => setFilters((f) => ({ ...f, search: typeof v === 'function' ? v(f.search) : v }))
  // 검색을 확정하면 켜 둔 분류를 푼다(App.jsx submitSearch와 같은 규칙).
  const submitSearch = (raw) => {
    const query = raw.trim()
    setFilters((f) => (query === '' ? { ...f, search: query } : { ...f, search: query, categories: new Set() }))
  }
  const applyFromSheet = (draft) => {
    setFilters(draft)
    saveMinAmount(draft.minAmount)
    setSheetOpen(false)
  }

  return (
    <div className="toss">
      {mounted && (
        <Suspense fallback={null}>
          <FilterSheet open={sheetOpen} filters={filters} brands={brands} onApply={applyFromSheet} onClose={() => setSheetOpen(false)} />
        </Suspense>
      )}

      <div className="title-bar-spacer" aria-hidden="true" />
      <TopBarB
        barRef={barRef}
        pushToggleRef={pushToggleRef}
        filters={filters}
        setFilters={setFilters}
        search={filters.search}
        setSearch={setSearch}
        onSearchSubmit={submitSearch}
        brands={brands}
        isFiltered={!isDefaultFilters(filters)}
        resetFilters={() => setFilters(readSaved)}
        sheetOpen={sheetOpen}
        onOpenSheet={() => setSheetOpen(true)}
        popular={null}
        reportHold={false}
      />

      <main className="toss-main">
        {brands && (
          <div className="quick-bar">
            <div className="quick-bar__sorts" role="group" aria-label="정렬">
              {[['amount', 'desc', '할인금액 높은순'], ['minOrder', 'asc', '최소주문 낮은순']].map(([key, dir, label]) => {
                const first = primarySort(filters)
                const on = first.key === key && first.dir === dir
                return (
                  <button
                    key={key}
                    type="button"
                    className={`quick-bar__chip${on ? ' quick-bar__chip--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      // 정렬은 하나다. 켜져 있는 것을 다시 누르면 기본(할인액 높은 순)으로.
                      const next = on ? [{ key: 'amount', dir: 'desc' }] : [{ key, dir }]
                      setFilters((f) => ({ ...f, sorts: next }))
                      track('quick_filter', { key, dir, on: !on })
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="quick-bar__actions">
              <button
                type="button"
                role="switch"
                aria-checked={filters.minAmount5k}
                className="quick-bar__switch"
                onClick={() => setFilters((f) => ({ ...f, minAmount5k: !f.minAmount5k }))}
              >
                <span>{minAmountLabel(filters.minAmount)} 이상만</span>
                <span className="quick-bar__switch-track" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <section className="toss-card">
          {failed && (
            <div className="toss-empty">
              <p>불러오지 못했어요</p>
              <button type="button" className="toss-textbtn" onClick={() => setTries((n) => n + 1)}>다시 시도</button>
            </div>
          )}
          {!failed && !brands && [0, 1, 2, 3, 4].map((i) => <div key={i} className="toss-skel" aria-hidden="true" />)}
          {brands && rows.length === 0 && <div className="toss-empty"><p>지금 받을 수 있는 할인이 없어요</p></div>}
          {rows.map((r) => (
            <a key={r.name} className="toss-row" href={r.href} onClick={(e) => openWithNotice(e, r.href)}>
              <BrandLogo name={r.name} />
              <span className="toss-row__mid">
                <span className="toss-row__name">{r.name}</span>
                <span className="toss-row__sub">
                  <PlatformBadge platformKey={r.platform} brand={r.name} />
                  <span className="toss-row__min">{r.minText}</span>
                </span>
              </span>
              <span className="toss-row__end">
                <span className="toss-row__amount">{r.amountText}</span>
                {r.chips.length > 0 && <span className="toss-row__chips">{r.chips.slice(0, 2).join(' · ')}</span>}
              </span>
            </a>
          ))}
        </section>
      </main>

      {rows[0] && (
        <div className="toss-cta">
          <a className="toss-cta__btn" href={rows[0].href} onClick={(e) => openWithNotice(e, rows[0].href)}>
            가장 큰 할인 받으러 가기
          </a>
        </div>
      )}
    </div>
  )
}
