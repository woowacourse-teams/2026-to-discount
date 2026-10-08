import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { PlatformBadge, PLATFORMS } from './logos.jsx'
import { CATEGORIES, MEMBERSHIP_FILTERABLE, MEMBERSHIP_OPTIONS, SORT_KEYS, defaultFilters, isDefaultFilters } from './filters.js'

/**
 * 아래에서 올라오는 필터 시트. 앱·분류·정렬을 한 자리에서 고르고
 * "적용"을 눌러야 목록이 바뀐다.
 *
 * <p>시트 안에서 만지는 값은 draft다 — 조건을 셋 다 바꾸는 동안 목록이
 * 매번 다시 그려지면 무엇을 고르는 중인지 보이지 않고, 중간 상태(예:
 * 앱을 전부 껐다가 다시 켜는 도중)에서 결과가 0건으로 깜빡인다.
 * 열 때마다 지금 적용된 값으로 draft를 채운다.
 */
export default function FilterSheet({ open, filters, onApply, onClose }) {
  const [draft, setDraft] = useState(filters)
  // 배경을 눌러 닫을 때, 누른 자리가 배경이었는지 기억해둔다. 시트 안에서
  // 끌기 시작해 배경에서 손을 뗀 동작까지 닫기로 세면 고르던 게 날아간다.
  const downOnScrim = useRef(false)

  // 열릴 때만 동기화한다. 열려 있는 동안 바깥 값이 바뀌어도(메뉴바에서
  // 분류를 켜는 등) draft를 덮지 않는다 — 고르던 게 날아간다.
  useEffect(() => {
    if (open) setDraft(filters)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 열려 있는 동안 뒤 목록은 스크롤되지 않는다(2026-10-08 사용자, 쿠폰 카드 시트와 같게).
  // 2026-09-18에는 스크롤바가 사라지며 폭이 흔들려 잠그지 않았다. 사라진 스크롤바 폭만큼 오른쪽 여백을 채워 막는다.
  const sheetRef = useRef(null)
  const bodyRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const s = document.body.style
    const prev = { overflow: s.overflow, paddingRight: s.paddingRight }
    const bar = window.innerWidth - document.documentElement.clientWidth
    s.overflow = 'hidden'
    if (bar > 0) s.paddingRight = `${bar}px`
    return () => { s.overflow = prev.overflow; s.paddingRight = prev.paddingRight }
  }, [open])

  // 끌어내려 닫기. 본문이 맨 위일 때 아래로 끌면 시트가 따라 내려오고, 놓을 때 120px을 넘었거나 빠르게 튕겼으면 닫는다.
  useEffect(() => {
    const el = sheetRef.current
    if (!open || !el) return undefined
    let d = null
    const start = (e) => { d = { y0: e.touches[0].clientY, t: Date.now(), dy: 0, active: false } }
    const move = (e) => {
      if (!d) return
      const y = e.touches[0].clientY
      if (!d.active) {
        if (y - d.y0 <= 4) return
        if ((bodyRef.current?.scrollTop ?? 0) > 0) { d.y0 = y; return }
        d.active = true; d.y0 = y
      }
      d.dy = Math.max(0, y - d.y0)
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.dy}px)`
      e.preventDefault()
    }
    const end = () => {
      if (!d?.active) { d = null; return }
      const close = d.dy > 120 || (d.dy > 40 && Date.now() - d.t < 300)
      el.style.transition = 'transform .18s ease'
      el.style.transform = close ? 'translateY(100%)' : ''
      d = null
      if (close) setTimeout(onClose, 160)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [open, onClose])

  // ESC로 닫는다. 키보드만 쓰는 사용자에게 닫을 길이 배경 클릭뿐이면 안 된다.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const toggleIn = (field, key) => setDraft((d) => {
    const next = new Set(d[field])
    if (next.has(key)) next.delete(key); else next.add(key)
    return { ...d, [field]: next }
  })

  return (
    <div
      className="sheet-scrim"
      /* pointerdown에서 바로 닫으면 시트가 사라진 뒤 같은 손짓의 click이
         아래 카드에 떨어져 브랜드 링크가 열렸다. 배경을 누른 것은 취소지
         뒤 화면을 누른 것이 아니다 — click까지 배경이 받아낸 뒤 닫는다. */
      onPointerDown={(e) => { downOnScrim.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (!downOnScrim.current || e.target !== e.currentTarget) return
        downOnScrim.current = false
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }}
    >
      <section ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label="필터">
        <div className="sheet__grip" aria-hidden="true" />
        <button type="button" className="sheet__close" aria-label="닫기" onClick={onClose}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div ref={bodyRef} className="sheet__body">
          <h2 className="sheet__title">플랫폼{draft.platforms.size === 0 && <span className="sheet__hint sheet__hint--warn">하나 이상 선택해 주세요</span>}</h2>
          {/* A안 바의 앱 버튼을 그대로 쓴다. 배지 자체가 버튼이어야
              aria-pressed가 붙고, 거기 걸린 A안 규칙(체크 배지·안 고른 앱
              흐리기)이 그대로 산다. */}
          <div className="sheet__apps page-head__apps">
            {PLATFORMS.map((p) => (
              <span key={p.key} className="platform-badge-wrap">
                <PlatformBadge
                  platformKey={p.key}
                  active={draft.platforms.has(p.key)}
                  onClick={() => {
                    toggleIn('platforms', p.key)
                    track('platform_filter_toggle', { platform: p.key, from: 'sheet' })
                  }}
                />
              </span>
            ))}
          </div>

          <h2 className="sheet__title">카테고리</h2>
          <div className="sheet__chips">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`sheet__chip${draft.categories.has(c.key) ? ' sheet__chip--on' : ''}`}
                aria-pressed={draft.categories.has(c.key)}
                onClick={() => {
                  toggleIn('categories', c.key)
                  track('category_change', { category: c.key, from: 'sheet' })
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <h2 className="sheet__title">필터링</h2>
          <div className="sheet__chips">
            <button
              type="button"
              className={`sheet__chip${draft.includeRandom ? ' sheet__chip--on' : ''}`}
              aria-pressed={draft.includeRandom}
              onClick={() => setDraft((d) => ({ ...d, includeRandom: !d.includeRandom }))}
            >
              랜덤쿠폰도 넣기
            </button>
            <button
              type="button"
              className={`sheet__chip${draft.includeMenu ? ' sheet__chip--on' : ''}`}
              aria-pressed={draft.includeMenu}
              onClick={() => setDraft((d) => ({ ...d, includeMenu: !d.includeMenu }))}
            >
              특정메뉴 쿠폰도 넣기
            </button>
            <button
              type="button"
              className={`sheet__chip${draft.minAmount5k ? ' sheet__chip--on' : ''}`}
              aria-pressed={draft.minAmount5k}
              onClick={() => setDraft((d) => ({ ...d, minAmount5k: !d.minAmount5k }))}
            >
              5,000원 이상 할인만
            </button>
          </div>

          <h2 className="sheet__title">정렬</h2>
          {/* 정렬은 하나만(2026-09-19, 사용자). 고른 것이 곧 정렬이다. 방향 있는 기준은 라벨 한 줄 +
              높은순/낮은순 두 버튼. 켜진 버튼을 다시 누르면 기본(할인액 높은 순)으로 돌아간다. */}
          {SORT_KEYS.filter((k) => k.directional).map((k) => {
            const idx = draft.sorts.findIndex((x) => x.key === k.key)
            const chosen = idx >= 0 ? draft.sorts[idx] : null
            const set = (dir) => setDraft((d) => ({
              ...d,
              sorts: chosen && chosen.dir === dir ? [{ key: 'amount', dir: 'desc' }] : [{ key: k.key, dir }],
            }))
            return (
              <div key={k.key} className="sheet__sort-row">
                <span className={`sheet__sort-label${chosen ? ' sheet__sort-label--on' : ''}`}>{k.label}</span>
                <span className="sheet__chips">
                  {[['desc', '높은순'], ['asc', '낮은순']].map(([dir, label]) => (
                    <button
                      key={dir}
                      type="button"
                      className={`sheet__chip${chosen?.dir === dir ? ' sheet__chip--on' : ''}`}
                      aria-pressed={chosen?.dir === dir}
                      onClick={() => set(dir)}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </div>
            )
          })}
          <div className="sheet__sort-row">
            <span className="sheet__sort-label">그 외</span>{/* 인기순·최신순은 하나만 — 둘을 겹쳐 봐야 뜻이 없다(2026-09-19). */}
            <span className="sheet__chips">
              {SORT_KEYS.filter((k) => !k.directional).map((k) => {
                const idx = draft.sorts.findIndex((x) => x.key === k.key)
                const on = idx >= 0
                return (
                  <button
                    key={k.key}
                    type="button"
                    className={`sheet__chip${on ? ' sheet__chip--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setDraft((d) => ({ ...d, sorts: on ? [{ key: 'amount', dir: 'desc' }] : [{ key: k.key, dir: 'desc' }] }))}
                  >
                    {k.label}
                  </button>
                )
              })}
            </span>
          </div>

          {/* 멤버십: 배민클럽, 쿠팡와우는 실제로 거른다(끄면 그 전용 오퍼를 뺀다). 요기패스는 식별을 못 해 구현 예정(2026-10-04). */}
          <h2 className="sheet__title">멤버십</h2>
          <div className="sheet__chips">
            {MEMBERSHIP_OPTIONS.map((m) => {
              const works = Object.values(MEMBERSHIP_FILTERABLE).includes(m.key)
              if (!works) {
                return (
                  <button key={m.key} type="button" className="sheet__chip sheet__chip--soon" aria-disabled="true" title="구현 예정입니다"
                    onClick={() => track('membership_toggle', { platform: m.key, state: 'soon', from: 'sheet' })}>
                    {m.label} <span className="sheet__soon">구현 예정</span>
                  </button>
                )
              }
              const on = draft.memberships?.has(m.key) ?? true
              return (
                <button key={m.key} type="button" className={`sheet__chip${on ? ' sheet__chip--on' : ''}`} aria-pressed={on}
                  onClick={() => { toggleIn('memberships', m.key); track('membership_toggle', { platform: m.key, state: on ? 'off' : 'on', from: 'sheet' }) }}>
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="sheet__actions">
          <button
            type="button"
            className="sheet__reset"
            disabled={isDefaultFilters(draft)}
            onClick={() => setDraft((d) => ({ ...defaultFilters(), search: d.search }))}
          >
            초기화
          </button>
          <button type="button" className="sheet__apply" onClick={() => onApply(draft)}>
            적용
          </button>
        </div>
      </section>
    </div>
  )
}
