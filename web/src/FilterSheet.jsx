import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { PlatformBadge, PLATFORMS } from './logos.jsx'
import { CATEGORIES, MEMBERSHIP_OPTIONS, SORT_KEYS, defaultFilters, isDefaultFilters } from './filters.js'

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

  // 본문 스크롤은 잠그지 않는다(2026-09-18). 잠그면 스크롤바가 생겼다 사라지며
  // 화면 폭이 바뀌어 목록이 좌우로 흔들렸다. 시트 자체가 스크롤을 먹고,
  // 배경은 그대로 둔다 — 닫았을 때 위치가 바뀌는 것보다 그쪽이 덜 거슬린다.

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
      <section className="sheet" role="dialog" aria-modal="true" aria-label="필터">
        <div className="sheet__grip" aria-hidden="true" />
        <button type="button" className="sheet__close" aria-label="닫기" onClick={onClose}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="sheet__body">
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
              className={`sheet__chip${draft.minAmount5k ? ' sheet__chip--on' : ''}`}
              aria-pressed={draft.minAmount5k}
              onClick={() => setDraft((d) => ({ ...d, minAmount5k: !d.minAmount5k }))}
            >
              5,000원 이상 할인만
            </button>
          </div>

          <h2 className="sheet__title">정렬 <span className="sheet__hint">복수 선택 가능</span></h2>
          {/* 방향 있는 기준은 라벨 한 줄 + 높은순/낮은순 두 버튼. 같은 기준의 반대 방향을 누르면
              방향만 바뀐다. 켜진 버튼을 다시 누르면 그 기준이 빠진다. 고른 순서가 우선순위라
              칩 앞에 번호를 붙인다. */}
          {SORT_KEYS.filter((k) => k.directional).map((k) => {
            const idx = draft.sorts.findIndex((x) => x.key === k.key)
            const chosen = idx >= 0 ? draft.sorts[idx] : null
            const set = (dir) => setDraft((d) => {
              const rest = d.sorts.filter((x) => x.key !== k.key)
              if (chosen && chosen.dir === dir) return { ...d, sorts: rest }                                     // 끄기
              if (chosen) return { ...d, sorts: d.sorts.map((x) => (x.key === k.key ? { key: k.key, dir } : x)) } // 방향만
              return { ...d, sorts: [...d.sorts, { key: k.key, dir }] }                                          // 추가
            })
            return (
              <div key={k.key} className="sheet__sort-row">
                <span className={`sheet__sort-label${chosen ? ' sheet__sort-label--on' : ''}`}>{idx >= 0 ? `${idx + 1}. ` : ''}{k.label}</span>
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
                    onClick={() => setDraft((d) => ({ ...d, sorts: on ? d.sorts.filter((x) => x.key !== k.key) : [...d.sorts.filter((x) => SORT_KEYS.find((s) => s.key === x.key)?.directional), { key: k.key, dir: 'desc' }] }))}
                  >
                    {on ? `${idx + 1}. ` : ''}{k.label}
                  </button>
                )
              })}
            </span>
          </div>

          {/* 멤버십 반영 로직은 아직 없다. 자리와 이름만 두고 수요를 집계한다. 맨 아래(2026-09-19). */}
          <h2 className="sheet__title">
            멤버십 <span className="sheet__soon">구현 예정</span>
          </h2>
          <div className="sheet__chips">
            {MEMBERSHIP_OPTIONS.map((m) => (
              <button
                key={m.key}
                type="button"
                className="sheet__chip sheet__chip--soon"
                aria-disabled="true"
                title="구현 예정입니다"
                onClick={() => {
                  track('membership_toggle', { platform: m.key, state: 'soon', from: 'sheet' })
                }}
              >
                {m.label}
              </button>
            ))}
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
