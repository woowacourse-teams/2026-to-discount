import { useEffect, useRef } from 'react'
import { BrandLogo, PlatformBadge } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { useDragClose } from '../../sheetParts.jsx'
import { includesFrom } from '../../filters.js'
import { detailOf, splitAmount } from './data.js'

// 자세히 보기 바텀시트. 모양과 닫는 법(배경, 닫기 버튼, ESC, 끌어내리기)은 필터 시트와 같은 클래스를 쓴다.
export default function DetailSheet({ card, filters, onClose }) {
  const sheetRef = useRef(null)
  const bodyRef = useRef(null)
  const downOnScrim = useRef(false)
  const offers = detailOf(card.brand, includesFrom(filters))

  // 열려 있는 동안 뒤 목록은 스크롤되지 않는다(FilterSheet와 같은 방식).
  useEffect(() => {
    const s = document.body.style
    const prev = { overflow: s.overflow, paddingRight: s.paddingRight }
    const bar = window.innerWidth - document.documentElement.clientWidth
    s.overflow = 'hidden'
    if (bar > 0) s.paddingRight = `${bar}px`
    return () => { s.overflow = prev.overflow; s.paddingRight = prev.paddingRight }
  }, [])
  useDragClose(sheetRef, bodyRef, true, onClose)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="sheet-scrim"
      onPointerDown={(e) => { downOnScrim.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (!downOnScrim.current || e.target !== e.currentTarget) return
        downOnScrim.current = false
        onClose()
      }}
    >
      <section ref={sheetRef} className="sheet v2-sheet" role="dialog" aria-modal="true" aria-label={`${card.name} 자세히 보기`}>
        <div className="sheet__grip" aria-hidden="true" />
        <button type="button" className="sheet__close" aria-label="닫기" onClick={onClose}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div ref={bodyRef} className="sheet__body v2-sheet__body">
          <div className="v2-sheet__head">
            <BrandLogo name={card.name} />
            <h2 className="v2-sheet__name">{card.displayName}</h2>
          </div>
          <ul className="v2-sheet__offers">
            {offers.map((o, i) => (
              <li key={`${o.platform}${i}`} className="v2-sheet__offer">
                <div className="v2-sheet__app">
                  <PlatformBadge platformKey={o.platform} via={o.via} brand={card.name} />
                  <span>{o.appLabel}</span>
                </div>
                <p className="v2-sheet__amount">{(() => { const a = splitAmount(o.amountLabel); return a ? <><span className="v2-num">{a.num}</span><span className="v2-unit">{a.rest}</span></> : o.amountLabel })()}</p>
                <div className="v2-sheet__chips">
                  {o.chips.map((c, j) => <span key={`${c.kind}${j}`} className={`v2-chip v2-chip--${c.kind}`}>{c.text}</span>)}
                  <span className="v2-chip v2-chip--min">{o.minLabel}</span>
                </div>
                {o.rows.length > 0 && (
                  <ul className="v2-sheet__rows">
                    {o.rows.map((r, j) => (
                      <li key={j}>
                        <strong>{r.amount}</strong>
                        {r.extra && <span> {r.extra}</span>}
                        <span> · {r.min}</span>
                        {r.chips.map((c, k) => <span key={k} className={`v2-chip v2-chip--${c.kind}`}>{c.text}</span>)}
                      </li>
                    ))}
                  </ul>
                )}
                {o.note && <p className="v2-sheet__note">{o.note}</p>}
                {o.href && (
                  <a className="v2-go" href={o.href} target="_blank" rel="noopener" onClick={(e) => openWithNotice(e, o.href)}>
                    {o.appLabel}에서 받으러 가기
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
