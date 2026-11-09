import { Suspense, lazy, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import TopBarB from '../../TopBarB.jsx'
import PopularDock from '../../PopularDock.jsx'
import PushNotificationSetting from '../../PushNotificationSetting.jsx'
import { useScrollMore } from '../../MenuBar.jsx'
import { track } from '../../analytics.js'
import { brandCardId } from '../../cardId.js'
import { applyFilters, defaultFilters, isDefaultFilters, primarySort, readMinAmount, saveMinAmount } from '../../filters.js'
import OfferShareButton from '../../OfferShareButton.jsx'
import DetailSheet from './DetailSheet.jsx'
import { cardsFor, loadHome } from './data.js'
import { Amount, Chip, GoButton, MinOrder } from './parts.jsx'
import './my-brands-v2.css'

const FilterSheet = lazy(() => import('../../FilterSheet.jsx'))

// 시트에서 고른 기준 금액은 이 브라우저에 남는다. 없으면 기본값(App.jsx와 같은 규칙).
const readSaved = () => {
  const n = readMinAmount()
  return n ? { ...defaultFilters(), minAmount: n } : defaultFilters()
}

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

function Card({ card, position, where, onDetail }) {
  const open = (e) => { if (card.href) openWithNotice(e, card.href) }
  const link = card.href ? { href: card.href, target: '_blank', rel: 'noopener', onClick: open } : {}
  // 받으러 가기 버튼과 공유 버튼 밖을 누르면 자세히 보기(바텀시트). 자세히 보기 단추의 click도 위로 올라와 여기서 한 번만 받는다.
  return (
    <li className="v2-card" id={brandCardId(card.name)} onClick={(e) => { if (!e.target.closest('.v2-go, .v2-share')) onDetail(card, position) }}>
      <div className="v2-card__top">
        <span className="v2-card__head">
          <BrandLogo name={card.name} />
          <span className="v2-card__name">{card.displayName}</span>
        </span>
        <OfferShareButton offer={card.offer} brandName={card.name} position={position} where={where} className="v2-share" />
      </div>
      <button type="button" className="v2-card__body" aria-haspopup="dialog">
        {card.chips.length > 0 && (
          <span className="v2-card__chips">
            {card.chips.map((c, i) => <Chip key={`${c.kind}${i}`} c={c} />)}
          </span>
        )}
        <span className="v2-card__price">
          <Amount label={card.amountLabel} className="v2-card__amount" />
          <MinOrder label={card.minLabel} />
        </span>
      </button>
      <div className="v2-card__foot">
        <GoButton link={link} platform={card.platform} appLabel={card.appLabel} />
      </div>
      <button type="button" className="v2-more" aria-haspopup="dialog">자세히 보기<span aria-hidden="true"> ›</span></button>
    </li>
  )
}

export default function MyBrandsV2Shell() {
  const [brands, setBrands] = useState(null)
  const [failed, setFailed] = useState(false)
  const [filters, setFilters] = useState(readSaved)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [detail, setDetail] = useState(null)
  const barRef = useRef(null)
  // 알림 켜고 끈 결과 말풍선이 앉는 자리(TopBarB 안). App.jsx와 같은 방식으로 받는다.
  const [pushToggleSlot, setPushToggleSlot] = useState(null)
  const pushToggleRef = useCallback((el) => { startTransition(() => setPushToggleSlot(el)) }, [])
  useBarHeight(barRef)
  useEffect(() => setMounted(true), [])
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

  useEffect(() => {
    let alive = true
    loadHome().then((b) => { if (alive) setBrands(b) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const cards = useMemo(() => (brands ? cardsFor(brands, filters) : []), [brands, filters])
  // 인기 순위는 분류와 검색을 뺀 목록으로 낸다(App.jsx rankBrands와 같다).
  const rankBrands = useMemo(
    () => (brands ? applyFilters(brands, { ...filters, categories: new Set(), search: '' }) : null),
    [brands, filters],
  )
  // 순위에서 브랜드를 고르면 분류와 검색을 풀고 그 카드로 간다.
  const pickPopular = (name) => {
    setFilters((f) => ({ ...f, categories: new Set(), search: '' }))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(brandCardId(name))?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }))
  }
  const setSearch = (v) => setFilters((f) => ({ ...f, search: typeof v === 'function' ? v(f.search) : v }))
  // 검색을 확정하면 켜 둔 분류를 푼다(App.jsx submitSearch와 같은 규칙).
  const submitSearch = (raw) => {
    const query = raw.trim()
    setFilters((f) => (query === '' ? { ...f, search: query } : { ...f, search: query, categories: new Set() }))
  }
  const openDetail = (card, position) => {
    setDetail(card)
    track('card_detail_open', { brand: card.name, platform: card.platform, position, where: 'my-brands-v2' })
  }
  const closeDetail = useCallback(() => setDetail(null), [])
  const applyFromSheet = (draft) => {
    setFilters(draft)
    saveMinAmount(draft.minAmount)
    setSheetOpen(false)
  }
  return (
    <>
      {mounted && (
        <Suspense fallback={null}>
          <FilterSheet open={sheetOpen} filters={filters} brands={brands} onApply={applyFromSheet} onClose={() => setSheetOpen(false)} />
        </Suspense>
      )}

      {detail && <DetailSheet card={detail} filters={filters} onClose={closeDetail} />}

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

      <main className="v2">
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
        {failed && <p className="v2-empty">-</p>}
        {!brands && !failed && <p className="v2-empty">...</p>}
        <ul className="v2-list">
          {cards.map((card, i) => <Card key={card.name} card={card} position={i} where="my-brands-v2" onDetail={openDetail} />)}
        </ul>
      </main>
    </>
  )
}
