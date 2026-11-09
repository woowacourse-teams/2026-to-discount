import { Suspense, lazy, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import TopBarB from '../../TopBarB.jsx'
import PopularDock from '../../PopularDock.jsx'
import PushNotificationSetting from '../../PushNotificationSetting.jsx'
import { brandCardId } from '../../cardId.js'
import { track } from '../../analytics.js'
import { useScrollMore } from '../../MenuBar.jsx'
import { applyFilters, defaultFilters, isDefaultFilters, primarySort, readMinAmount, saveMinAmount } from '../../filters.js'
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
  // 알림 켜고 끈 결과 말풍선이 앉는 자리(TopBarB 안). App.jsx와 같은 방식으로 받는다.
  const [pushToggleSlot, setPushToggleSlot] = useState(null)
  const pushToggleRef = useCallback((el) => { startTransition(() => setPushToggleSlot(el)) }, [])
  useBarHeight(barRef)
  // 정렬 줄은 터치로 넘기고 마우스로도 끌어 넘긴다(App.jsx와 같다).
  const [sortRef, sortMore] = useScrollMore()
  const dragScroll = useMemo(() => {
    let x0 = 0, left0 = 0, moved = false, el = null
    return {
      onPointerDown: (e) => { if (e.pointerType !== 'mouse') return; el = e.currentTarget; x0 = e.clientX; left0 = el.scrollLeft; moved = false },
      onPointerMove: (e) => { if (!el) return; const dx = e.clientX - x0; if (Math.abs(dx) > 4) moved = true; el.scrollLeft = left0 - dx },
      onPointerUp: () => { el = null },
      onPointerLeave: () => { el = null },
      onClickCapture: (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false } },
    }
  }, [])
  const isFiltered = !isDefaultFilters(filters)
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

  // 인기 순위는 분류와 검색을 뺀 목록으로 낸다(App.jsx rankBrands와 같다).
  const rankBrands = useMemo(
    () => (brands ? applyFilters(brands, { ...filters, categories: new Set(), search: '' }) : null),
    [brands, filters],
  )
  // 순위에서 브랜드를 고르면 분류와 검색을 풀고 그 줄로 간다.
  const pickPopular = (name) => {
    setFilters((f) => ({ ...f, categories: new Set(), search: '' }))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(brandCardId(name))?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }))
  }

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
        isFiltered={isFiltered}
        resetFilters={() => setFilters(readSaved)}
        sheetOpen={sheetOpen}
        onOpenSheet={() => setSheetOpen(true)}
        popular={rankBrands && <PopularDock brands={rankBrands} onPick={pickPopular} />}
        reportHold={false}
      />

      <PushNotificationSetting toggleSlot={pushToggleSlot} />
      <main className="toss-main">
        {brands && (
          <div className="quick-bar">
            <div className="quick-bar__sortwrap">
              <span className={`menu-bar__more menu-bar__more--left quick-bar__more${sortMore.left ? ' menu-bar__more--on' : ''}`} aria-hidden="true">‹</span>
              <span className={`menu-bar__more menu-bar__more--right quick-bar__more${sortMore.right ? ' menu-bar__more--on' : ''}`} aria-hidden="true">›</span>
              <div className="quick-bar__sorts" role="group" aria-label="정렬" ref={sortRef} {...dragScroll}>
                {[['amount', 'desc', '할인금액 높은순'], ['minOrder', 'asc', '최소주문금액 낮은순'], ['popularity', 'desc', '인기순'], ['recent', 'desc', '최신순']].map(([key, dir, label]) => {
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
            </div>
            <div className="quick-bar__tools">
              <button type="button" className={`icon-btn${isFiltered ? ' icon-btn--active' : ''}`} disabled={!isFiltered}
                onClick={() => setFilters(readSaved)} aria-label="필터 초기화" title={isFiltered ? '필터 초기화' : '되돌릴 필터가 없습니다'}>
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" /></svg>
              </button>
              <button type="button" className={`icon-btn${sheetOpen ? ' icon-btn--on' : isFiltered ? ' icon-btn--active' : ''}`}
                aria-expanded={sheetOpen} aria-label="필터 열기" title="필터" onClick={() => setSheetOpen(true)}>
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2"><path d="M18.796 4H5.204a1 1 0 0 0-.753 1.659l5.302 6.058a1 1 0 0 1 .247.659v4.874a.5.5 0 0 0 .2.4l3 2.25a.5.5 0 0 0 .8-.4v-7.124a1 1 0 0 1 .247-.659l5.302-6.059c.566-.646.106-1.658-.753-1.658Z" /></svg>
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
            <a key={r.name} id={brandCardId(r.name)} className="toss-row" href={r.href} onClick={(e) => openWithNotice(e, r.href)}>
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

    </div>
  )
}
