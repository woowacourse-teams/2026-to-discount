import { useEffect, useId, useRef, useState } from 'react'
import { track } from './analytics.js'
import BrandSuggestions from './BrandSuggestions.jsx'
import { PlatformBadge, PLATFORMS } from './logos.jsx'
import { CATEGORIES, MEMBERSHIP_LABEL } from './filters.js'
import { useBrandAutocomplete } from './useBrandAutocomplete.js'

/**
 * A안 검색 — 접힌 원형 버튼, 누르면 입력칸이 펼쳐진다.
 *
 * <p>B안은 바 전체를 입력칸이 차지한다. A는 한 줄에 앱 버튼 넷과 조작
 * 셋이 같이 서야 해서 넓은 입력칸을 놓을 자리가 없다 — 같은 검색이지만
 * 바 구조가 달라 다른 모양이 된다. 그 차이가 이 실험이 보려는 것이다.
 *
 * <p>입력 중에는 목록이 흔들리지 않는다. 확정(엔터·검색 버튼)해야 필터가
 * 걸린다 — 글자를 칠 때마다 결과가 튀면 무엇을 치는 중인지 안 보인다.
 */
function SearchControlA({ value, onSubmit, brands }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)
  const listboxId = useId()
  const autocomplete = useBrandAutocomplete({
    brands,
    input: draft,
    onSelect: (brand) => {
      setDraft(brand.name)
      onSubmit(brand.name, 'autocomplete')
      setOpen(false)
    },
  })

  useEffect(() => {
    if (open) {
      setDraft(value)
      inputRef.current?.focus()
    }
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (e.target.closest('.search-control')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const submit = (method) => {
    autocomplete.close()
    onSubmit(draft, method)
    setOpen(false)
  }

  return (
    <div className="search-control">
      <button
        type="button"
        className={`search-control__btn${open ? ' search-control__btn--open' : ''}`}
        aria-expanded={open}
        aria-label={open ? '브랜드 검색 닫기' : '브랜드 검색 열기'}
        onClick={() => setOpen((v) => !v)}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {open && (
        <div className="search-panel">
          <input
            ref={inputRef}
            type="search"
            className="search-control__input"
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
              if (e.key === 'Escape') setOpen(false)
            }}
          />
          <button type="button" className="search-panel__submit"
            onClick={() => submit('button')}>
            검색
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
      )}
    </div>
  )
}

/**
 * A안 상단 바 — 조건을 전부 펼쳐 둔다.
 *
 *   [배민][쿠팡][땡겨요][요기요]        [담기][초기화][검색]
 *    배민클럽 쿠팡와우 지역화폐 요기패스
 *   ─────────────────────────────────────────────────
 *   전체  치킨  피자  패스트푸드 …            (가로 스크롤)
 *
 * <p>B안은 같은 조건을 바텀시트에 감춘다. 무엇을 감추는 게 나은지가
 * 이 실험에서 보려는 것이다.
 *
 * <p>분류는 A에서 하나만 고른다. 상태는 B와 같은 Set을 쓰되(두 안이
 * 한 상태를 공유해야 화면을 갈아끼워도 걸린 조건이 유지된다) 여기서는
 * 고른 하나로만 덮어쓴다 — 캐러셀에 여럿을 켜두면 어느 것이 지금
 * 목록을 정하는지 밑줄만으로는 안 읽힌다.
 */
export default function TopBarA({
  barRef,
  filters,
  setFilters,
  search,
  onSearchSubmit,
  brands,
  cart,
  cartOnly,
  setCartOnly,
  cartEnabled,
  isFiltered,
  resetFilters,
}) {
  const [membershipHint, setMembershipHint] = useState(null)

  // Set 하나짜리를 단일 선택처럼 읽는다. 비어 있으면 "전체"다.
  const selected = filters.categories.size === 1
    ? [...filters.categories][0]
    : 'all'

  const selectCategory = (key) => {
    setFilters((f) => ({
      ...f,
      categories: key === 'all' ? new Set() : new Set([key]),
    }))
    track('category_change', { category: key, from: 'bar' })
  }

  const togglePlatform = (key) => {
    setFilters((f) => {
      const next = new Set(f.platforms)
      if (next.has(key)) next.delete(key); else next.add(key)
      return { ...f, platforms: next }
    })
    // 시트에서 같은 행동을 쏘는 이름을 그대로 쓴다 — 조작 위치만 다르니
    // from으로 가른다. 이름을 새로 만들면 집계할 때마다 둘을 합쳐야 한다.
    track('platform_filter_toggle', { platform: key, from: 'bar' })
  }

  // 멤버십은 아직 계산 모델이 없다 — 눌러도 상태가 안 바뀌고, 왜 안
  // 바뀌는지만 알린다.
  const toggleMembership = (key) => {
    setMembershipHint(key)
    track('membership_toggle', { platform: key, state: 'soon', from: 'bar' })
  }

  const tabs = [{ key: 'all', label: '전체' }, ...CATEGORIES]

  return (
    <div className="title-bar" ref={barRef}>
      <div className="title-bar__inner">
        <h1 className="sr-only">오늘의할인 — 배달앱 브랜드 할인 비교</h1>

        <div className="page-head__apps" aria-label="비교 대상 배달앱">
          {PLATFORMS.map((p) => (
            <span key={p.key} className="platform-badge-wrap">
              <PlatformBadge
                platformKey={p.key}
                onClick={(e) => {
                  e.stopPropagation()
                  togglePlatform(p.key)
                }}
                active={filters.platforms.has(p.key)}
              />

              {/* 고른 앱에만 멤버십 버튼이 로고 밑에 붙는다. 위치로 어느
                  앱 것인지 드러나므로 여러 앱을 한 줄로 묶지 않는다. */}
              {filters.platforms.has(p.key) && (
                <button
                  type="button"
                  className="membership-btn membership-btn--soon"
                  data-platform={p.key}
                  data-hint={membershipHint === p.key ? 'on' : undefined}
                  aria-disabled="true"
                  title="구현 예정입니다"
                  onClick={() => toggleMembership(p.key)}
                >
                  {MEMBERSHIP_LABEL[p.key]}
                </button>
              )}
            </span>
          ))}
        </div>

        <div className="title-bar__ops">
          <div className="title-bar__actions">
            {/* 담아둔 브랜드만 모아 본다. 담은 게 없으면 누를 것이
                없으므로 비활성이다.
                2026-08-25 끔 — App.jsx의 CART_ENABLED 참고. */}
            {cartEnabled && <button
              type="button"
              className={`cart-btn${cartOnly ? ' cart-btn--on' : ''}`}
              aria-pressed={cartOnly}
              disabled={cart.size === 0}
              aria-label={cartOnly ? '전체 보기' : '담아둔 브랜드만 보기'}
              title={cart.size === 0 ? '담아둔 브랜드가 없다' : (cartOnly ? '전체 보기' : '담아둔 것만 보기')}
              onClick={() => {
                setCartOnly((v) => {
                  track('cart_view_toggle', { state: v ? 'off' : 'on', count: cart.size })
                  return !v
                })
              }}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="18" cy="20" r="1.4" />
                <path d="M2 3h3l2.4 12.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
              </svg>
              {cart.size > 0 && <span className="cart-btn__count">{cart.size}</span>}
            </button>}

            <button
              type="button"
              className={`filter-reset-btn${isFiltered ? ' filter-reset-btn--active' : ''}`}
              disabled={!isFiltered}
              onClick={resetFilters}
              aria-label="필터 초기화"
              title={isFiltered ? '필터 초기화' : '되돌릴 필터가 없습니다'}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>

            <SearchControlA value={search} onSubmit={onSearchSubmit} brands={brands} />
          </div>
        </div>
      </div>

      {/* 분류 캐러셀. 버튼을 눌러 패널을 여는 대신 그냥 깔아둔다 —
          분류를 고르는 건 이 화면의 주된 조작이고, 한 번 더 누르게
          하면 그만큼 안 쓴다. 좁으면 옆으로 흐른다. */}
      <nav className="cat-bar" aria-label="분류">
        <ul className="cat-bar__list">
          {tabs.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                className={`cat-bar__item${selected === c.key ? ' cat-bar__item--on' : ''}`}
                aria-current={selected === c.key ? 'true' : undefined}
                onClick={() => selectCategory(c.key)}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
