import { useEffect, useLayoutEffect, useRef } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { openWithNotice } from '../../offerLink.js'
import { useDragClose } from '../../sheetParts.jsx'
import { includesFrom } from '../../filters.js'
import { detailOf } from './data.js'
import PriceChart from './PriceChart.jsx'
import { Amount, Chip, GoButton, MinOrder, PlatformLogo } from './parts.jsx'

const DUR = 360
const EASE = 'cubic-bezier(.2, .8, .2, 1)'
const px = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
const FIX = ['position', 'left', 'top', 'width', 'height', 'margin', 'maxHeight']
const unfix = (el) => FIX.forEach((k) => { el.style[k] = '' })
const fixAt = (el, r) => Object.assign(el.style, px(r), { position: 'fixed', margin: '0', maxHeight: 'none' })

// 자세히 보기 바텀시트. 모양과 닫는 법(배경, 닫기 버튼, ESC, 끌어내리기)은 필터 시트와 같은 클래스를 쓴다.
// from(눌린 카드의 화면 위치)이 있으면 시트가 그 카드 자리에서 늘어나 바텀시트 모양이 되고 배경이 어두워진다.
// closing이면 거꾸로 카드 크기로 오므라든 뒤 onExited를 부른다. 움직임을 줄이는 설정이면 모션 없이 바로 뜨고 닫힌다.
export default function DetailSheet({ card, from, closing, filters, onClose, onExited }) {
  const sheetRef = useRef(null)
  const scrimRef = useRef(null)
  const exitedRef = useRef(onExited)
  exitedRef.current = onExited
  const morph = !!from && typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches
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
  // 열기: 최종 자리를 재어 두고, 카드 자리에서 거기까지 모양(위치, 크기, 모서리)을 바꾼다. 안의 내용은 중간부터 나타난다.
  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!morph || !sheet || !sheet.animate) return undefined
    const to = sheet.getBoundingClientRect()
    fixAt(sheet, to)
    const anims = [
      sheet.animate([{ ...px(from), borderRadius: '22px' }, { ...px(to), borderRadius: '18px 18px 0 0' }], { duration: DUR, easing: EASE }),
      scrimRef.current.animate([{ backgroundColor: 'rgba(0, 0, 0, 0)' }, { backgroundColor: 'rgba(0, 0, 0, .32)' }], { duration: DUR, easing: 'ease-out' }),
      ...[...sheet.children].map((c) => c.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: DUR, easing: 'linear' })),
    ]
    anims[0].onfinish = () => unfix(sheet)
    return () => { anims.forEach((a) => a.cancel()); unfix(sheet) }
  }, [])
  // 닫기: 지금 모양에서 카드 자리와 크기로 오므라든다. 끌어내려 이미 화면 밖으로 간 시트는 그대로 내린다.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!closing) return undefined
    if (!morph || !sheet?.animate || sheet.style.transform) { exitedRef.current(); return undefined }
    const cur = sheet.getBoundingClientRect()
    fixAt(sheet, cur)
    const opt = { duration: 280, easing: EASE, fill: 'forwards' }
    const a = sheet.animate([{ ...px(cur), borderRadius: '18px 18px 0 0' }, { ...px(from), borderRadius: '22px' }], opt)
    scrimRef.current.animate([{ backgroundColor: 'rgba(0, 0, 0, .32)' }, { backgroundColor: 'rgba(0, 0, 0, 0)' }], opt)
    ;[...sheet.children].forEach((c) => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }))
    a.onfinish = () => exitedRef.current()
    return undefined
  }, [closing])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={scrimRef}
      className="sheet-scrim"
      onPointerDown={(e) => { downOnScrim.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (!downOnScrim.current || e.target !== e.currentTarget) return
        downOnScrim.current = false
        onClose()
      }}
    >
      <section ref={sheetRef} className={`sheet v2-sheet${morph ? ' v2-sheet--morph' : ''}`} role="dialog" aria-modal="true" aria-label={`${card.name} 자세히 보기`}>
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
          <PriceChart brand={card.name} />
          <ul className="v2-sheet__offers">
            {offers.map((o, i) => (
              <li key={`${o.platform}${i}`} className="v2-sheet__offer">
                <div className="v2-sheet__app"><PlatformLogo platform={o.platform} label={o.appLabel} /></div>
                <p className="v2-sheet__amount"><Amount label={o.amountLabel} /></p>
                {/* 배지와 최소주문은 아래 구간 줄에 다 나온다. 구간이 없는 오퍼만 여기서 보인다. */}
                {o.rows.length === 0 && (
                  <div className="v2-sheet__chips">
                    {o.chips.map((c, j) => <Chip key={`${c.kind}${j}`} c={c} />)}
                    <MinOrder label={o.minLabel} />
                  </div>
                )}
                {o.rows.length > 0 && (
                  <ul className="v2-sheet__rows">
                    {o.rows.map((r, j) => (
                      <li key={j} className="v2-sheet__row">
                        <div className="v2-sheet__rowtop">
                          <strong>{r.amount}</strong>
                          {r.chips.map((c, k) => <Chip key={k} c={c} />)}
                        </div>
                        <div className="v2-sheet__rowsub">{[r.extra, r.min].filter(Boolean).join(' · ')}</div>
                      </li>
                    ))}
                  </ul>
                )}
                {o.note && <p className="v2-sheet__note">{o.note}</p>}
                <GoButton
                  link={o.href ? { href: o.href, target: '_blank', rel: 'noopener', onClick: (e) => openWithNotice(e, o.href) } : {}}
                  platform={o.platform}
                  appLabel={o.appLabel}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
