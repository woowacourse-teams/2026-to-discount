import { useEffect, useRef, useState } from 'react'
import { BrandLogo } from '../../logos.jsx'
import { useDragClose } from '../../sheetParts.jsx'
import { track } from '../../analytics.js'
import { useShareTargetFocus } from '../../useShareTargetFocus.js'
import { sharedOfferKey } from '../../offerSharing.js'
import { detailOf } from './data.js'
import PriceChart, { prefetchHistory } from './PriceChart.jsx'
import OfferShareButton from '../../OfferShareButton.jsx'
import { Amount, Chip, GoButton, MinOrder, PlatformLogo, offerLinkProps } from './parts.jsx'

const FADE = 140  // 닫힘: 그 자리에서 투명해진다. 열림(180ms 페이드와 살짝 커짐)은 my-brands-v2.css의 v2-sheet-in.

// 자세히 보기 바텀시트. 레이아웃과 스타일(바닥에 붙은 너비 전체 시트, 위 모서리 둥글게, 손잡이, 탭)과 닫는 법(배경, 닫기 버튼, ESC, 끌어내리기, 뒤로 버튼)은 필터 시트와 같은 클래스를 쓴다.
// 높이는 내용만큼이다(바닥에 맞추려 키우지 않는다). 뜰 때는 올라오거나 카드에서 날아오지 않고 제자리에서 팝업처럼 페이드로 나타난다.
// closing이면 그 자리에서 투명해진 뒤 onExited를 부른다. 움직임을 줄이는 설정이면 모션 없이 바로 뜨고 닫힌다.
export default function DetailSheet({ card, position, include, closing, sharedKey, onShareTargetVisible, onHide, onClose, onExited }) {
  const sheetRef = useRef(null)
  const offersRef = useRef(null)
  const scrimRef = useRef(null)
  const [tab, setTab] = useState('offers')
  const exitedRef = useRef(onExited)
  exitedRef.current = onExited
  const animated = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches
  const downOnScrim = useRef(false)
  const offers = detailOf(card.brand, include)

  // 열려 있는 동안 뒤 목록은 스크롤되지 않는다(FilterSheet와 같은 방식).
  useEffect(() => {
    const s = document.body.style
    const prev = { overflow: s.overflow, paddingRight: s.paddingRight }
    const bar = window.innerWidth - document.documentElement.clientWidth
    s.overflow = 'hidden'
    if (bar > 0) s.paddingRight = `${bar}px`
    return () => { s.overflow = prev.overflow; s.paddingRight = prev.paddingRight }
  }, [])
  useDragClose(sheetRef, offersRef, true, onClose)
  // 공유 링크로 들어온 오퍼는 시트 안에서 그 자리로 가서 포커스를 받는다(운영 카드와 같다).
  useShareTargetFocus(sheetRef, sharedKey, true, onShareTargetVisible)
  // 시트가 뜨는 순간 가격 이력을 받기 시작한다(카드를 누를 때 이미 받기 시작했으면 그 요청을 쓴다). 기록 탭은 열기 전에 이미 그려져 있다.
  useEffect(() => { prefetchHistory(card.name) }, [card.name])
  // 닫기: 모양은 그대로 두고 시트와 배경이 투명해진다. 끌어내려 이미 화면 밖으로 간 시트와 움직임 줄이기 설정은 바로 닫는다.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!closing) return undefined
    if (!animated || !sheet?.animate || sheet.style.transform) { exitedRef.current(); return undefined }
    const opt = { duration: FADE, easing: 'ease-out', fill: 'forwards' }
    const a = sheet.animate([{ opacity: 1 }, { opacity: 0 }], opt)
    scrimRef.current.animate([{ backgroundColor: 'rgba(0, 0, 0, .32)' }, { backgroundColor: 'rgba(0, 0, 0, 0)' }], opt)
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
      className="sheet-scrim v2-scrim"
      onPointerDown={(e) => { downOnScrim.current = e.target === e.currentTarget }}
      onClick={(e) => {
        // 포털이라도 React 이벤트는 카드로 올라가 카드 클릭이 시트를 다시 연다. 여기서 끊는다(운영 카드와 같다).
        e.stopPropagation()
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
        <div className="v2-sheet__top">
          <div className="v2-sheet__head">
            <BrandLogo name={card.name} />
            <h2 className="v2-sheet__name">{card.displayName}</h2>
          </div>
          <div className="v2-tabs" role="tablist" aria-label="자세히 보기">
            {[['offers', '할인 상세'], ['history', '할인 기록']].map(([k, label]) => (
              <button key={k} type="button" role="tab" id={`v2tab-${k}`} aria-selected={tab === k} aria-controls={`v2panel-${k}`} className="v2-tab" onClick={() => { track('sheet_tab', { brand: card.name, tab: k === 'history' ? 'history' : 'detail', bothVisible: false }); setTab(k) }}>{label}</button>
            ))}
          </div>
        </div>
        <div className="sheet__body v2-sheet__body">
          {/* 두 탭의 칸이 같은 자리에 겹쳐 있어(숨긴 쪽은 안 보일 뿐 자리는 차지) 팝업 높이는 더 긴 쪽에 맞고 탭을 바꿔도 안 변한다. */}
          <div role="tabpanel" id="v2panel-history" aria-labelledby="v2tab-history" className={`v2-panel v2-panel--history${tab === 'history' ? '' : ' v2-panel--off'}`} aria-hidden={tab !== 'history'} inert={tab !== 'history' ? '' : undefined}>
            <PriceChart brand={card.name} />
          </div>
          <ul ref={offersRef} role="tabpanel" id="v2panel-offers" aria-labelledby="v2tab-offers" className={`v2-panel v2-panel--offers v2-sheet__offers${tab === 'offers' ? '' : ' v2-panel--off'}`} aria-hidden={tab !== 'offers'} inert={tab !== 'offers' ? '' : undefined}>
            {offers.map((o, i) => (
              <li key={`${o.platform}${i}`} className={`v2-sheet__offer${sharedKey === sharedOfferKey(o.offer) ? ' shared-offer-target' : ''}`} tabIndex={-1} data-offer-key={sharedOfferKey(o.offer)}>
                <div className="v2-sheet__app">
                  <PlatformLogo platform={o.platform} label={o.appLabel} />
                  <OfferShareButton offer={o.offer} brandName={card.name} position={position} where="sheet" className="v2-share" />
                </div>
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
                  link={offerLinkProps({ offer: o.offer, brand: card.brand, position, best: o.best, where: 'sheet', slot: o.slotBase + i + 1, expanded: true })}
                  platform={o.platform}
                  appLabel={o.appLabel}
                />
              </li>
            ))}
            {onHide && (
              <li className="v2-sheet__hideitem">
                <button type="button" className="v2-sheet__hide" aria-label={`${card.name} 숨기기`} onClick={onHide}>이 브랜드 숨기기</button>
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  )
}
