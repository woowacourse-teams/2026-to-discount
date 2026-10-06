// 메인 화면 A안 16차 브랜드 카드(쿠폰 티켓형). 표시 규칙: tracker docs/superpowers/specs/2026-10-03-home-a-display-model.md
// 쿠폰 구조는 늘 같다(앱 아이콘, 금액, 최소주문, 이동 꼭지). 배지와 계산식은 쿠폰 밖(또는 남는 칸)에 둔다.
// 폭을 재는 코드를 두지 않는다(총 차단 시간). 이름 크기는 글자 수로, 절취 홈은 CSS 마스크로 판다.
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from './analytics.js'
import { brandImpressionProps, observeBrandImpression } from './brandImpression.js'
import { brandCardId } from './BrandCard.jsx'
import { amountText, badgesOf, isUpdated, channelOf, conditionTable, shortBrandName, formulaOf, minLabel, nameCutPx, splitOffers } from './couponModel.js'
import { offerKey } from './filters.js'
import { BrandLogo, PlatformBadge } from './logos.jsx'
import { COUPANGEATS_HINT, offerClickProps, offerLink, openWithNotice } from './offerLink.js'
import './styles/coupon-card.css'

const Up = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l4 5H7.2v3H4.8V7H2z" fill="currentColor" /></svg>
)

// 배지: 운영 화면(OfferChip)의 배지 마크업과 클래스를 그대로 쓴다(chip-tags 안 offer__range-badge, offer__status-badge). 새로 그리지 않는다.
const RANGE_CLASS = { 'qualifier-plain': 'plain', 'qualifier-random': 'random', rate: 'rate', 'best-fit': 'optimal' }
function OpBadge({ b, platform }) {
  if (b.kind === 'membership') return <span className="offer__status-badge offer__status-badge--membership" data-platform={platform}>{b.text}</span>
  if (b.kind === 'limited') return <span className="offer__status-badge">{b.text}</span>
  return <span className={`offer__range-badge offer__range-badge--${RANGE_CLASS[b.kind] ?? 'plain'}`}>{b.text}</span>
}

function Min({ value }) {
  if (value == null) return null
  // 최소주문 + n원 + 화살표(2026-10-06 사용자). 0이면 '최소주문 없음' 그대로.
  if (!(value > 0)) return <span className="cc-min">{minLabel(value)}</span>
  return <span className="cc-min">최소주문 {minLabel(value)}원<Up /></span>
}

// 품절은 운영 칩과 같다: 금액에 취소선, 옆에 "품절" 라벨.
function Amt({ offer }) {
  const hasNum = offer.amount != null
  const num = hasNum ? offer.amount.toLocaleString('ko-KR') : amountText(offer)
  return (
    <span className="cc-amt">
      {/* 상위 오퍼 금액은 '원 할인'으로 끝낸다(2026-10-06 사용자) */}
      {offer.soldOut ? <s>{num}{hasNum && <small>원 할인</small>}</s> : <>{num}{hasNum && <small>원 할인</small>}</>}
      {offer.soldOut && <em className="cc-soldout">품절</em>}
    </span>
  )
}

function OfferLinkA({ offer, brand, position, best, where, slot, expanded, className, children, ...rest }) {
  const href = offerLink(offer, brand.links, brand.name)
  const web = href.startsWith('http')
  return (
    <a className={className} href={href} {...rest}
       // 커스텀 스킴(coupangeats://, ddangyo://, baemin://)은 같은 탭에서 열어야 앱으로 간다(운영 칩과 같다).
       target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       aria-label={`${brand.name} ${amountText(offer)}, 앱으로 이동`}
       onClick={(e) => { track('offer_link_click', offerClickProps({ offer, brandName: brand.name, position, best, where, slot, expanded })); openWithNotice(e, href) }}>
      {children}
    </a>
  )
}

const LinkIcon = () => (
  // 바깥으로 나가는 링크(네모 + 오른쪽 위 화살표, 2026-10-06 사용자)
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4h7v7" /><path d="M20 4 11 13" /><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></svg>
)

// 쿠폰(메인, 캐러셀, 펼친 쿠폰 모두 같은 꼴과 크기, 17차 시안): 왼쪽 앱 로고, 금액과 최소주문, 오른쪽 앱 색 이동 꼭지(링크 아이콘).
// 배지는 쿠폰 안에 두지 않는다(브랜드명 옆, 캐러셀이면 보이는 쿠폰 것).
function Coupon({ o, brand, position, best, where = 'main', slot, expanded, ...rest }) {
  return (
    // 감싸개: 쿠폰(마스크로 홈을 판다)은 바깥으로 삐져나온 것을 잘라서, 업데이트 탭은 감싸개에 단다
    <div className="cc-tkw">
    {isUpdated(o) && <span className="cc-upd">신규 할인</span>}
    <div className="cc-ticket" data-platform={o.platform} {...rest}>
      <span className="cc-info">
        <PlatformBadge platformKey={o.platform} brand={brand.name} />
        <span className="cc-num"><Amt offer={o} /><Min value={o.minOrderAmount} /></span>
      </span>
      <OfferLinkA offer={o} brand={brand} position={position} best={best} where={where} slot={slot} expanded={expanded} className="cc-stub"><LinkIcon /></OfferLinkA>
    </div>
    {o.platform === 'coupangeats' && <p className="ce-note">{COUPANGEATS_HINT}</p>}
    </div>
  )
}

// 배지 묶음(채널 + 배지). 운영 탭 마크업, 쿠폰 배지 규격 하나(coupon-card.css .cc-tags)
function Tags({ o }) {
  const ch = channelOf(o)
  // 복합은 늘 맨 오른쪽(사용자 2026-10-06)
  const tags = [...badgesOf(o)].sort((x, y) => (x.kind === 'best-fit') - (y.kind === 'best-fit'))
  if (!ch && tags.length === 0) return null
  return (
    <span className="cc-tags"><span className="chip-tags">
      {ch && <span className="offer__status-badge">{ch}</span>}
      {tags.map((b) => (b.kind === 'best-fit'
        ? <ComboInfo key={b.kind} o={o} text={b.text} />
        : <OpBadge key={b.kind} b={b} platform={o.platform} />))}
    </span></span>
  )
}

// 복합 배지 옆 (i): 올리면(데스크톱) 또는 누르면(모바일) 무엇을 합친 값인지와 계산식을 띄운다.
function ComboInfo({ o, text }) {
  // 카드 머리줄은 넘치는 것을 자른다(overflow hidden) — 설명 창은 화면 기준(fixed)으로 단추 아래에 띄운다.
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const fx = formulaOf(o)
  const pop = useRef(null)
  const show = () => { const r = btn.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right - 8), above: r.top }) }
  // 창이 화면 밖으로 나가지 않게: 좌우는 8px 안쪽으로, 아래가 모자라면 단추 위로 올린다
  useLayoutEffect(() => {
    const el = pop.current
    if (!el || !pos) return
    const r = el.getBoundingClientRect()
    if (r.left < 8) el.style.right = `${Math.max(8, window.innerWidth - 8 - r.width)}px`
    if (r.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, pos.above - 6 - r.height)}px`
  }, [pos])
  const hide = () => setPos(null)
  useEffect(() => {
    if (!pos) return undefined
    const outside = (e) => { if (!btn.current?.contains(e.target)) hide() }
    window.addEventListener('scroll', hide, { passive: true, once: true })
    document.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('scroll', hide); document.removeEventListener('pointerdown', outside) }
  }, [pos])
  return (
    // (i)는 배지 안에 둔다(2026-10-06 사용자)
    <span className="offer__range-badge offer__range-badge--optimal cc-combo" onMouseEnter={show} onMouseLeave={hide}>
      {text}
      <button type="button" ref={btn} className="cc-combo__btn" aria-label="복합 할인 설명" aria-expanded={!!pos}
              onClick={(e) => { e.stopPropagation(); pos ? hide() : show() }}>i</button>
      {pos && createPortal(
        <span ref={pop} className="cc-info__pop" role="tooltip" style={{ top: pos.top, right: pos.right }}>
          고정 할인 쿠폰과 중복 할인 쿠폰을 합쳐<br />최적의 할인을 계산한 결과입니다.
          {fx && <><br /><b>{fx}</b></>}
        </span>, document.body)}
    </span>
  )
}

// 동점 최고: 오퍼마다 단독 쿠폰과 같은 쿠폰 하나, 가로 캐러셀(CSS 스크롤 스냅)에 나란히. 배지는 그 쿠폰 오른쪽 위 포스트잇.
// 현재 위치 점은 IntersectionObserver로만 갱신한다(스크롤 이벤트, 폭 재기 없음). 서버 렌더와 마운트 전에는 첫 점이 켜져 있다.
function Carousel({ brand, best, position, idx, setIdx }) {
  const ref = useRef(null)
  const drag = useRef(null)
  // 마우스로 끌어 넘기기. 끄는 동안만 scrollLeft를 갱신하고(폭을 재지 않는다), 끝나면 스냅이 맞춘다. 끌었으면 그 뒤 클릭은 막는다.
  const onDown = (e) => { if (e.pointerType === 'mouse' && e.button === 0) drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false } }
  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) > 5) { d.moved = true; ref.current.setPointerCapture(e.pointerId); ref.current.classList.add('cc-dragging') }
    if (d.moved) ref.current.scrollLeft = d.left - dx
  }
  const onUp = () => {
    const d = drag.current
    if (!d) return
    ref.current.classList.remove('cc-dragging')
    if (d.moved) setTimeout(() => { drag.current = null }, 0)
    else drag.current = null
  }
  const onClickCapture = (e) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation() } }
  // 캐러셀을 넘겼다(사람이 넘긴 것만: 지금 쿠폰이 바뀐 때). 첫 그리기는 세지 않는다.
  const shownIdx = useRef(idx)
  useEffect(() => {
    if (shownIdx.current === idx) return
    track('coupon_carousel_swipe', { brand: brand.name, from: shownIdx.current, to: idx, count: best.length, platform: best[idx]?.platform ?? 'none' })
    shownIdx.current = idx
  }, [idx])
  useEffect(() => {
    const root = ref.current
    if (!root || typeof IntersectionObserver === 'undefined') return undefined
    const slides = [...root.children]
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setIdx(slides.indexOf(e.target))
    }, { root, threshold: 0.6 })
    slides.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [best.length])
  return (
    <div className="cc-carousel-wrap">
      <div className="cc-carousel" ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}>
        {best.map((o, i) => (
          <div key={offerKey(o)} className={`cc-slide${i === idx ? ' cc-slide--cur' : ''}`}>
            <Coupon o={o} brand={brand} position={position} best where="carousel" slot={i + 1} />
          </div>
        ))}
      </div>
      <div className="cc-dots" aria-hidden="true">{best.map((o, i) => <i key={offerKey(o)} className={i === idx ? 'on' : undefined} />)}</div>
    </div>
  )
}

// 상세 표: 구간마다 한 줄(금액, 조건 칩, 최소주문), 조건 문장은 표 아래 한 줄. head는 복수 최고일 때 어느 앱 표인지 밝히는 아이콘.
function DetailTable({ t, i, head, fx }) {
  return (
    <div className="cc-tbl" style={{ '--i': i }}>
      {head && <span className="cc-t-head">{head}</span>}
      {t.rows.map((r, k) => (
        <Fragment key={k}>
          <span className="cc-t-amt">{r.amount}{r.extra && <small>{r.extra}</small>}</span>
          <span className="cc-t-chips">{r.chips.map((c) => <span key={c.text} className={`detail__channel${c.kind === 'membership' ? ' detail__tier-membership' : ''}`} data-platform={c.platform}>{c.text}</span>)}</span>
          <span className="cc-t-min">{r.min}</span>
        </Fragment>
      ))}
      {fx && <span className="cc-t-note cc-t-fx">{fx}</span>}
      {t.note && <span className="cc-t-note">{t.note}</span>}
    </div>
  )
}

function Ticket({ brand, best, hasBest, position, idx, setIdx }) {
  if (best.length === 1) return <Coupon o={best[0]} brand={brand} position={position} best={hasBest} />
  return <Carousel brand={brand} best={best} position={position} idx={idx} setIdx={setIdx} />
}

// 펼침/접힘(CSS grid 0fr 1fr 기법, M3 확장 250ms 안팎, emphasized easing). 폭·높이를 재지 않는다.
// phase: false(접힘, DOM에 없음) → 'enter'(내용을 0fr로 먼저 DOM에 넣음) → 'open'(두 프레임 뒤 1fr) → 'leave'(0fr로 닫는 중) → false.
const OPEN_MS = 280
const LEAVE_MS = 220
function CouponCard({ brand, position, highlighted, onInteract, include = null, onHide, leaving = false, photo = false, compact = false }) {
  const { best, rest, hasBest } = useMemo(() => splitOffers(brand.offers, include), [brand.offers, include?.random, include?.menu])
  const [phase, setPhase] = useState(false)
  const [cur, setCur] = useState(0) // 캐러셀에서 보이는 쿠폰. 브랜드명 옆 배지가 이걸 따른다
  const [settled, setSettled] = useState(false) // 다 열린 뒤에는 overflow를 풀어 쿠폰 그림자가 잘리지 않게 한다
  const open = phase === 'open'
  const shown = phase !== false
  const cardRef = useRef(null)
  const headRef = useRef(null)
  const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const toggle = () => {
    onInteract?.()
    if (phase === false) { track('brand_expand', { brand: brand.name, category: brand.category ?? 'none' }); setPhase('enter') }
    else if (phase === 'open' || phase === 'enter') { track('brand_collapse', { brand: brand.name, category: brand.category ?? 'none' }); setSettled(false); setPhase('leave') }
    else if (phase === 'leave') setPhase('open')
  }
  // 카드 아무 곳이나 누르면 펼치기/접기. 링크, 숨기기 버튼, 캐러셀 끌기는 제외한다.
  const onCardClick = (e) => {
    if (e.target.closest('a, .cc-hide, .cc-carousel.cc-dragging')) return
    if (canExpand) toggle()
  }
  // 딥링크(#brand-이름)로 들어오면 펼친 채로 그 카드로 스크롤한다(운영 카드와 같다).
  useEffect(() => {
    if (highlighted) { setPhase('enter'); cardRef.current?.scrollIntoView({ block: 'center' }) }
  }, [highlighted])
  // 보이지 않는 영역에 먼저 배치(0fr)한 뒤 두 프레임 뒤에 1fr로 바꿔 커지는 도중 레이아웃이 튀지 않게 한다.
  useEffect(() => {
    if (phase !== 'enter') return undefined
    let r2
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setPhase('open')) })
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
  }, [phase])
  useEffect(() => {
    if (phase !== 'open') return undefined
    const t = setTimeout(() => setSettled(true), reduce() ? 0 : OPEN_MS + 120)
    return () => clearTimeout(t)
  }, [phase])
  // 접기 끝(transitionend 또는 시간 안전장치)에 DOM에서 내린다.
  useEffect(() => {
    if (phase !== 'leave') return undefined
    const t = setTimeout(() => setPhase(false), reduce() ? 0 : LEAVE_MS + 40 * (rest.length + best.length) + 140)
    return () => clearTimeout(t)
  }, [phase, rest.length, best.length])
  useEffect(() => observeBrandImpression(headRef.current, brandImpressionProps(brand, position),
    (p) => track('brand_impression', p)), [brand, position])

  const shownName = shortBrandName(brand)
  const single = best.length === 1 ? best[0] : null
  const fx = single && formulaOf(single)
  // 동점 최고(캐러셀)는 펼쳐도 지금 보이는 쿠폰은 제자리에 두고, 나머지 최고 쿠폰만 하위 오퍼처럼 아래로 늘어선다(카드가 줄었다 늘지 않게)
  const stack = best.length > 1
  const hasTbl = (o) => { const t = conditionTable(o); return t.rows.length > 0 || !!t.note }
  // 펼칠 게 없으면(하위 오퍼도, 최고 쿠폰의 상세 표도 없음) 자세히 보기를 숨기고 자리만 둔다
  // 상세 표가 쿠폰에 이미 보이는 것(금액, 최소주문, 채널·멤버십 배지)만 되풀이하면 펼칠 것이 없다:
  // 구간이 둘 이상이거나 조건 문장이 있어야 더 볼 것이 있다(2026-10-05 사용자: 노모어피자처럼 다 보이면 자세히 보기를 없앤다).
  const hasMore = (o) => { const t = conditionTable(o); return t.rows.length > 1 || !!t.note }
  const canExpand = rest.length > 0 || stack || best.some(hasMore)
  const top = stack ? [best[cur] ?? best[0]] : best
  const bestTables = shown ? top.map((o) => ({ o, t: conditionTable(o) })).filter(({ t }) => t.rows.length || t.note) : []
  const listed = stack ? [...best.filter((o) => o !== top[0]), ...rest] : rest
  return (
    <article id={brandCardId(brand.name)} ref={cardRef} data-brand={brand.name} onClick={onCardClick}
             className={`cc${open ? ' cc--open' : ''}${settled ? ' cc--settled' : ''}${highlighted ? ' cc--highlighted' : ''}${leaving ? ' cc--leaving' : ''}${photo ? ' cc--photo' : ''}${compact ? ' cc--compact' : ''}${stack ? ' cc--stack' : ''}`}>
      <BrandLogo name={brand.name} size={64} />
      {/* 로고 오른쪽 고정 크기 블록(높이 = 로고): 1줄 이름+배지, 2줄 설명/계산식. 비어도 자리 유지 */}
      <div className="cc-head" ref={headRef}>
        {/* 1줄: 이름(안 들어가면 searchAliases의 가장 짧은 한글 별칭, 그래도 넘치면 말줄임) + 보이는 최고 쿠폰의 배지 */}
        <div className="cc-line">
          <button type="button" aria-expanded={open}>
            <span className="cc-nm" style={{ '--cut': `${nameCutPx(shownName)}px` }}>{shownName}</span>
          </button>
        </div>
        {/* 2줄: 배지(예전 계산식 자리). 계산식은 복합 배지의 (i) 설명으로 옮겼다(2026-10-06 사용자) */}
        {best[cur] && <div className="cc-fx cc-badges"><Tags o={best[cur]} /></div>}
      </div>
      <div className="cc-deal cc-deal--main"><div className="cc-main-in"><Ticket brand={brand} best={best} hasBest={hasBest} position={position} idx={cur} setIdx={setCur} /></div></div>
      {/* 최고 오퍼는 메인 쿠폰에 이미 있으니 쿠폰으로 다시 그리지 않고, 상세 표만 메인 쿠폰 바로 아래에 둔다 */}
      {bestTables.length > 0 && (
        <div className="cc-x"><div className="cc-x-in">
          {bestTables.map(({ o, t }, i) => (
            <DetailTable key={offerKey(o)} t={t} i={i} />
          ))}
        </div></div>
      )}
      {/* 접힌 하위 라벨(쿠폰 아래 한 줄, 최대 3개). 펼칠 때 먼저 사라지고(같은 grid 기법), 접으면 다시 나타난다. */}
      {rest.length > 0 && (
        <div className="cc-alts"><div className="cc-alts-in">
          {rest.slice(0, 3).map((o) => (
            <span key={offerKey(o)} className={`cc-alt${o.soldOut ? ' cc-alt--sold' : ''}`}><PlatformBadge platformKey={o.platform} brand={brand.name} />{amountText(o)}</span>
          ))}
        </div></div>
      )}
      {canExpand && <button type="button" className="cc-hint" aria-expanded={open}>
        자세히 보기
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
      {onHide && (
        <button type="button" className="cc-hide" aria-label={`${brand.name} 숨기기`} title="숨기기"
                onClick={() => onHide(brand.name, hasBest ? best[0].amount : null)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.2 6.7C3.9 8.2 3 10.2 3 12c0 2.5 4 7 9 7 1.6 0 3-.4 4.2-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
        </button>
      )}
      {/* 펼친 쿠폰은 펼쳤을 때만 그린다(접힌 동안 요소 수를 늘리지 않는다). */}
      {shown && (
        <div className="cc-x cc-x--rest"><div className="cc-x-in"><div className="cc-more">
          {listed.map((o, i) => {
            const f = formulaOf(o)
            const t = conditionTable(o)
            const hasTbl = t.rows.length > 0 || t.note || f
            const anim = { '--i': i + bestTables.length }
            return (
              <Fragment key={offerKey(o)}>
                <div className="cc-deal cc-deal--more" style={anim}>
                  <div className="cc-deal-col">
                    <Tags o={o} />
                    <Coupon o={o} brand={brand} position={position} best={stack && i < best.length - 1} where="expanded" slot={i + 1} expanded />
                  </div>
                </div>
                {hasTbl && <DetailTable t={t} i={i + bestTables.length} fx={f} />}
              </Fragment>
            )
          })}
          {/* 접기: 펼친 영역 맨 아래. 위의 "자세히 보기" 줄은 펼친 동안 보이지 않게만 한다 */}
          <button type="button" className="cc-fold" aria-expanded={open}>접기<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5L6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        </div></div></div>
      )}
    </article>
  )
}

export default memo(CouponCard)
