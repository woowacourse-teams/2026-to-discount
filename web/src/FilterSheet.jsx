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
  const [membershipHint, setMembershipHint] = useState(null)
  // 배경을 눌러 닫을 때, 누른 자리가 배경이었는지 기억해둔다. 시트 안에서
  // 끌기 시작해 배경에서 손을 뗀 동작까지 닫기로 세면 고르던 게 날아간다.
  const downOnScrim = useRef(false)

  // 열릴 때만 동기화한다. 열려 있는 동안 바깥 값이 바뀌어도(메뉴바에서
  // 분류를 켜는 등) draft를 덮지 않는다 — 고르던 게 날아간다.
  useEffect(() => {
    if (open) setDraft(filters)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 시트가 떠 있는 동안 뒤 목록이 같이 스크롤되면 시트를 닫았을 때
  // 엉뚱한 위치에 있다.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

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

        <div className="sheet__body">
          <h2 className="sheet__title">배달앱</h2>
          {/* A안 바의 앱 버튼을 그대로 쓴다(page-head__apps). 작은 회색
              배지로는 어느 앱을 껐는지 한눈에 안 읽혔다 — 앱 아이콘은
              사람들이 이미 아는 그림이라 크게 두는 편이 낫다. 규칙을
              베끼지 않고 같은 클래스를 붙여, 한쪽만 고쳐지는 일을 막는다. */}
          <div className="sheet__apps page-head__apps">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`sheet__app${draft.platforms.has(p.key) ? ' sheet__app--on' : ''}`}
                aria-pressed={draft.platforms.has(p.key)}
                onClick={() => {
                  toggleIn('platforms', p.key)
                  // 바의 플랫폼 배지가 여기로 옮겨왔다 — 조작 위치만
                  // 바뀐 것이라 같은 이벤트 이름을 그대로 쓴다.
                  track('platform_filter_toggle', { platform: p.key, from: 'sheet' })
                }}
              >
                <PlatformBadge platformKey={p.key} active={draft.platforms.has(p.key)} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {/* 앱을 전부 끄면 볼 게 없다. 막지 않고 알려만 준다 — 막으면
              마지막 하나를 끄려다 안 꺼져서 고장으로 읽힌다. */}
          {draft.platforms.size === 0 && (
            <p className="sheet__warn">앱을 하나도 안 고르면 결과가 비어 있다.</p>
          )}

          <h2 className="sheet__title">멤버십</h2>
          {/* 멤버십 반영 로직은 아직 없다(api docs/specs의 의도적 보류).
              자리와 이름을 미리 두되 누르면 상태가 안 바뀌고 "구현 예정"만
              알린다 — 눌렀는데 아무 일도 안 일어나면 고장으로 읽힌다.
              수요는 그대로 집계한다. */}
          <div className="sheet__chips">
            {MEMBERSHIP_OPTIONS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`sheet__chip sheet__chip--soon${membershipHint === m.key ? ' sheet__chip--hint' : ''}`}
                aria-disabled="true"
                title="구현 예정입니다"
                onClick={() => {
                  setMembershipHint(m.key)
                  setTimeout(() => setMembershipHint((cur) => (cur === m.key ? null : cur)), 1600)
                  track('membership_toggle', { platform: m.key, state: 'soon', from: 'sheet' })
                }}
              >
                {m.label}
                {membershipHint === m.key && <span className="sheet__soon">구현 예정</span>}
              </button>
            ))}
          </div>

          <h2 className="sheet__title">분류</h2>
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

          <h2 className="sheet__title">정렬</h2>
          <div className="sheet__chips">
            {SORT_KEYS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`sheet__chip${draft.sortKey === s.key ? ' sheet__chip--on' : ''}`}
                aria-pressed={draft.sortKey === s.key}
                onClick={() => setDraft((d) => ({ ...d, sortKey: s.key }))}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="sheet__chips">
            {[['desc', '높은 순'], ['asc', '낮은 순']].map(([dir, label]) => (
              <button
                key={dir}
                type="button"
                className={`sheet__chip${draft.sortDir === dir ? ' sheet__chip--on' : ''}`}
                aria-pressed={draft.sortDir === dir}
                onClick={() => setDraft((d) => ({ ...d, sortDir: dir }))}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 확정 없는 브랜드는 어느 기준에서도 뒤에 선다(filters.js
             sortBrands). 화면에 문장으로 적어두진 않는다 — 규칙을 다
             적으면 시트가 설명서가 되고, 정작 고르는 자리가 밀린다. */}
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
