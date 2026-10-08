import { useBackClose } from './backClose.js'
// 메인 화면 A/B 쿠폰 카드 쪽 상단 바: 2026-09 화면 실험의 B안(두 줄 바)을 되살렸다(1e9a40f에서 지운 코드).
// 1줄: 검색(걸린 조건 칩이 입력 안에) + 초기화·필터 버튼, 2줄: 분류 메뉴 바. 앱·정렬은 필터 시트에.
// 9월 판정은 "클릭률 차이 없음"이었고, 핵심(검색과 분류)을 앞에 두는 쪽으로 다시 쓴다(2026-10-04 사용자).
import { useEffect, useId, useRef, useState } from 'react'
import { track } from './analytics.js'
import BrandSuggestions from './BrandSuggestions.jsx'
import MenuBar from './MenuBar.jsx'
import { PLATFORMS } from './logos.jsx'
import { CATEGORIES, applyFilters } from './filters.js'
import { useBrandAutocomplete } from './useBrandAutocomplete.js'
import './styles/topbar-b.css'

function SearchControl({ value, onChange, onSubmit, chips, brands }) {
  const [draft, setDraft] = useState(value)
  // 검색 결과를 보는 중이면 뒤로 버튼이 검색을 풀고 첫 목록으로 돌아온다(2026-10-07 사용자)
  useBackClose(!!value, () => { setDraft(''); onSubmit('', 'back'); window.scrollTo(0, 0) })
  const rootRef = useRef(null)
  const listboxId = useId()
  const autocomplete = useBrandAutocomplete({
    brands,
    input: draft,
    onSelect: (brand) => {
      setDraft(brand.name)
      onSubmit(brand.name, 'autocomplete')
    },
  })

  // 바깥에서 검색어를 지우면(칩의 X, 초기화) 입력창도 따라 비어야 한다.
  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) autocomplete.close()
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [autocomplete.close])

  const submit = (method) => {
    autocomplete.close()
    onSubmit(draft, method)
  }

  return (
    <div className="search-field" ref={rootRef}>
      {/* 걸린 조건은 검색창 안에 토큰으로 앉는다. 둘 다 "지금 무엇을 보고 있는가"를 말하는 같은 정보다. */}
      <div className="search-field__content">
        {chips}
        <input
          type="search"
          className="search-field__input"
          placeholder="브랜드 검색"
          aria-label="브랜드 검색"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={autocomplete.isOpen}
          aria-controls={autocomplete.isOpen ? listboxId : undefined}
          aria-activedescendant={autocomplete.activeIndex >= 0 ? `${listboxId}-option-${autocomplete.activeIndex}` : undefined}
          value={draft}
          onFocus={autocomplete.open}
          onChange={(e) => { setDraft(e.target.value); autocomplete.inputChanged() }}
          onKeyDown={(e) => {
            if (autocomplete.handleKeyDown(e)) return
            if (e.key === 'Enter' && !e.repeat) submit('enter')
            if (e.key === 'Escape') { setDraft(''); onChange('') }
          }}
        />
      </div>
      <button type="button" className="search-field__submit" aria-label="검색" onClick={() => submit('button')}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
      {autocomplete.isOpen && (
        <BrandSuggestions
          suggestions={autocomplete.suggestions}
          activeIndex={autocomplete.activeIndex}
          listboxId={listboxId}
          onSelect={autocomplete.select}
        />
      )}
    </div>
  )
}

export default function TopBarB({ barRef, pushToggleRef, filters, setFilters, search, setSearch, onSearchSubmit, brands, isFiltered, resetFilters, sheetOpen, onOpenSheet }) {
  // 지금 상단 바(TopBarA)와 같은 규칙: 분류는 하나만, '전체'나 같은 분류를 다시 누르면 전체로. 계측도 같은 이벤트.
  const toggleCategory = (key) => {
    setFilters((f) => ({ ...f, updatedOnly: false, categories: key === 'all' || f.categories.has(key) ? new Set() : new Set([key]) }))
    track('category_change', { category: key, from: 'menu-bar' })
  }
  const menuSelected = filters.categories
  const newCount = brands ? applyFilters(brands, { ...filters, categories: new Set(), updatedOnly: true }).length : 0
  // 전체 / 신규(2026-10-05): 분류 바 맨 앞. 기본은 전체. 신규 = 새로 생겼거나 금액이 커진 오퍼가 있는 브랜드만.
  const leading = [
    { key: 'all', label: '전체', on: filters.categories.size === 0 && !filters.updatedOnly,
      onClick: () => { setFilters((f) => ({ ...f, updatedOnly: false, categories: new Set() })); track('category_change', { category: 'all', from: 'menu-bar' }) } },
    // 개수는 지금 조건(앱, 5천원 이상만 등)에서 신규만 켰을 때 남는 브랜드 수(설계의 "New N")
    { key: 'new', label: newCount ? `신규 ${newCount}` : '신규', on: !!filters.updatedOnly,
      onClick: () => { setFilters((f) => ({ ...f, updatedOnly: !f.updatedOnly, categories: new Set() })); track('quick_filter', { key: 'updated', on: !filters.updatedOnly }) } },
  ]
  return (
    <div className="title-bar title-bar--b" ref={barRef}>
      <div className="title-bar__top">
        <h1 className="sr-only">오늘의할인: 배달앱 브랜드 할인 비교</h1>
        <SearchControl
          value={search}
          onChange={setSearch}
          onSubmit={onSearchSubmit}
          brands={brands}
          chips={(
            <>
              {/* 칩 전체가 해제 버튼이다. ×는 무엇이 일어날지 알려주는 표시로만 둔다. */}
              {CATEGORIES.filter((c) => filters.categories.has(c.key)).map((c) => (
                <button type="button" className="search-chip" key={c.key}
                  aria-label={`${c.label} 해제`} onClick={() => toggleCategory(c.key)}>
                  {c.label}
                  <span className="search-chip__x" aria-hidden="true">×</span>
                </button>
              ))}
              {filters.platforms.size < PLATFORMS.length && (
                <button type="button" className="search-chip" aria-label="앱 선택 초기화"
                  onClick={() => setFilters((f) => ({ ...f, platforms: new Set(PLATFORMS.map((x) => x.key)) }))}>
                  앱 {filters.platforms.size}
                  <span className="search-chip__x" aria-hidden="true">×</span>
                </button>
              )}
            </>
          )}
        />
        <div className="title-bar__tools">
          <span ref={pushToggleRef} id="push-toggle-slot" className="push-toggle-slot" />
          <button type="button" className={`icon-btn${isFiltered ? ' icon-btn--active' : ''}`} disabled={!isFiltered}
            onClick={resetFilters} aria-label="필터 초기화" title={isFiltered ? '필터 초기화' : '되돌릴 필터가 없습니다'}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" /></svg>
          </button>
          <button type="button" className={`icon-btn${sheetOpen ? ' icon-btn--on' : isFiltered ? ' icon-btn--active' : ''}`}
            aria-expanded={sheetOpen} aria-label="필터 열기" title="필터" onClick={onOpenSheet}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="17" x2="14" y2="17" /></svg>
          </button>
        </div>
      </div>
      <MenuBar selected={menuSelected} onToggle={toggleCategory} leading={leading} />
    </div>
  )
}
