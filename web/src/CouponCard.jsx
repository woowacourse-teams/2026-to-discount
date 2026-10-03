// 메인 화면 A안 16차 브랜드 카드(쿠폰 티켓형). 표시 규칙: tracker docs/superpowers/specs/2026-10-03-home-a-display-model.md
// 쿠폰 구조는 늘 같다(앱 아이콘, 금액, 최소주문, 이동 꼭지). 배지와 계산식은 쿠폰 밖(또는 남는 칸)에 둔다.
// 폭을 재는 코드를 두지 않는다(총 차단 시간). 이름 크기는 글자 수로, 절취 홈은 CSS 마스크로 판다.
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { track } from './analytics.js'
import { brandImpressionProps, observeBrandImpression } from './brandImpression.js'
import { brandCardId } from './BrandCard.jsx'
import { amountText, badgesOf, channelOf, conditionTable, formulaOf, minLabel, nameCutPx, splitOffers } from './couponModel.js'
import { offerKey } from './filters.js'
import { BrandLogo, PlatformBadge } from './logos.jsx'
import { offerClickProps, offerLink } from './offerLink.js'
import './styles/coupon-card.css'

const Up = () => (
  <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l4 5H7.2v3H4.8V7H2z" fill="currentColor" /></svg>
)

function Tag({ b, platform }) {
  return <span className={`cc-tag cc-tag--${b.kind}`} data-platform={platform}>{b.text}</span>
}

function Min({ value }) {
  return <span className="cc-min">{value > 0 && <Up />}{minLabel(value)}</span>
}

// 품절은 운영 칩과 같다: 금액에 취소선, 옆에 "품절" 라벨.
function Amt({ offer }) {
  const ch = channelOf(offer)
  const won = offer.amount != null
  const num = won ? offer.amount.toLocaleString('ko-KR') : amountText(offer)
  return (
    <span className="cc-amt">
      {offer.soldOut ? <s>{num}{won && <small>원</small>}</s> : <>{num}{won && <small>원</small>}</>}
      {offer.soldOut && <em className="cc-soldout">품절</em>}
      {ch && <em className="cc-ch">{ch}</em>}
    </span>
  )
}

function OfferLinkA({ offer, brand, position, best, className, children, ...rest }) {
  const href = offerLink(offer, brand.links, brand.name)
  const web = href.startsWith('http')
  return (
    <a className={className} href={href} {...rest}
       // 커스텀 스킴(coupangeats://, ddangyo://, baemin://)은 같은 탭에서 열어야 앱으로 간다(운영 칩과 같다).
       target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       aria-label={`${brand.name} ${amountText(offer)}, 앱으로 이동`}
       onClick={() => track('offer_link_click', offerClickProps({ offer, brandName: brand.name, position, best }))}>
      {children}
    </a>
  )
}

// 쿠폰(메인, 캐러셀, 펼친 쿠폰 모두 같은 꼴과 크기): 흰 정보 칸(금액, 최소주문, 펼친 쿠폰은 오른쪽 빈칸에 배지 라벨),
// 하단 검은 띠, 오른쪽 앱 색 이동 영역(링크는 여기만, 앱 로고가 이동 버튼을 대신한다).
function Coupon({ o, brand, position, best, muted, side, ...rest }) {
  return (
    <div className={`cc-ticket${muted ? ' cc-ticket--muted' : ''}`} data-platform={o.platform} {...rest}>
      <span className="cc-info">
        <Amt offer={o} />
        <Min value={o.minOrderAmount} />
        {side}
      </span>
      <OfferLinkA offer={o} brand={brand} position={position} best={best} className="cc-stub"><PlatformBadge platformKey={o.platform} brand={brand.name} /></OfferLinkA>
    </div>
  )
}

// 동점 최고: 오퍼마다 단독 쿠폰과 같은 쿠폰 하나, 가로 캐러셀(CSS 스크롤 스냅)에 나란히. 배지는 그 쿠폰 오른쪽 위 포스트잇.
// 현재 위치 점은 IntersectionObserver로만 갱신한다(스크롤 이벤트, 폭 재기 없음). 서버 렌더와 마운트 전에는 첫 점이 켜져 있다.
function Carousel({ brand, best, position, }) {
  const [idx, setIdx] = useState(0)
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
        {best.map((o) => {
          const tags = badgesOf(o)
          return (
            <div key={offerKey(o)} className="cc-slide">
              <Coupon o={o} brand={brand} position={position} best />
              {tags.length > 0 && <span className="cc-postit">{tags.map((x) => <Tag key={x.kind} b={x} platform={o.platform} />)}</span>}
            </div>
          )
        })}
      </div>
      <div className="cc-dots" aria-hidden="true">{best.map((o, i) => <i key={offerKey(o)} className={i === idx ? 'on' : undefined} />)}</div>
    </div>
  )
}

// 상세 표: 구간마다 한 줄(금액, 조건 칩, 최소주문), 조건 문장은 표 아래 한 줄. head는 복수 최고일 때 어느 앱 표인지 밝히는 아이콘.
function DetailTable({ t, i, head, onEnd }) {
  return (
    <div className="cc-tbl" style={{ '--i': i }} onAnimationEnd={onEnd}>
      {head && <span className="cc-t-head">{head}</span>}
      {t.rows.map((r, k) => (
        <Fragment key={k}>
          <span className="cc-t-amt">{r.amount}{r.extra && <small>{r.extra}</small>}</span>
          <span className="cc-t-chips">{r.chips.map((c) => <em key={c}>{c}</em>)}</span>
          <span className="cc-t-min">{r.min}</span>
        </Fragment>
      ))}
      {t.note && <span className="cc-t-note">{t.note}</span>}
    </div>
  )
}

function Ticket({ brand, best, hasBest, position, }) {
  if (best.length === 1) return <Coupon o={best[0]} brand={brand} position={position} best={hasBest} muted={!hasBest} />
  return <Carousel brand={brand} best={best} position={position} />
}

function CouponCard({ brand, position, highlighted, onInteract, include = null, onHide, leaving = false, photo = false }) {
  const { best, rest, hasBest } = useMemo(() => splitOffers(brand.offers, include), [brand.offers, include?.random, include?.menu])
  // false | 'open' | 'closing'. 접을 때는 펼칠 때와 같은 애니메이션을 거꾸로 틀고 animationend에서 내린다(폭·높이를 재지 않는다).
  const [phase, setPhase] = useState(false)
  const open = phase === 'open'
  const shown = phase !== false
  const cardRef = useRef(null)
  const headRef = useRef(null)
  const toggle = () => {
    onInteract?.()
    setPhase((v) => {
      if (v !== 'open') track('brand_expand', { brand: brand.name, category: brand.category ?? 'none' })
      return v === 'open' ? 'closing' : 'open'
    })
  }
  // 딥링크(#brand-이름)로 들어오면 펼친 채로 그 카드로 스크롤한다(운영 카드와 같다).
  useEffect(() => {
    if (highlighted) { setPhase('open'); cardRef.current?.scrollIntoView({ block: 'center' }) }
  }, [highlighted])
  // 접는 중에 animationend가 안 와도(움직임 줄임, 탭이 가려짐) 카드가 펼친 채 남지 않게 시간 안전장치를 둔다
  useEffect(() => {
    if (phase !== 'closing') return undefined
    const t = setTimeout(() => setPhase(false), 160 + 40 * (rest.length + best.length) + 150)
    return () => clearTimeout(t)
  }, [phase, rest.length, best.length])
  useEffect(() => { // 움직임을 줄인 환경은 애니메이션이 없어 animationend가 안 온다
    if (phase === 'closing' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPhase(false)
  }, [phase])
  useEffect(() => observeBrandImpression(headRef.current, brandImpressionProps(brand, position),
    (p) => track('brand_impression', p)), [brand, position])

  const single = best.length === 1 ? best[0] : null
  const fx = single && formulaOf(single)
  return (
    <article id={brandCardId(brand.name)} ref={cardRef} data-brand={brand.name}
             className={`cc${open ? ' cc--open' : ''}${highlighted ? ' cc--highlighted' : ''}${leaving ? ' cc--leaving' : ''}${photo ? ' cc--photo' : ''}`}>
      {/* 두 줄 카드: 1줄 = 로고 + 이름·배지(+계산식 자리), 2줄 = 쿠폰 전체 폭, 그 아래 하위 라벨 한 줄, 그 아래 펼침 버튼 */}
      <BrandLogo name={brand.name} size={64} />
      {/* 로고 오른쪽 고정 크기 블록(높이 = 로고): 1줄 이름, 2줄 배지, 3줄 설명/계산식. 줄 높이는 CSS 고정, 비어도 자리 유지 */}
      <div className="cc-head" ref={headRef}>
        <button type="button" aria-expanded={open} onClick={toggle}>
          <span className="cc-nm" style={{ '--cut': `${nameCutPx(brand.name)}px` }}>{brand.name}</span>
        </button>
        {single && <div className="cc-tags">{badgesOf(single).map((b) => <Tag key={b.kind} b={b} platform={single.platform} />)}</div>}
        {fx && <div className="cc-fx">{fx}</div>}
      </div>
      <div className="cc-deal"><Ticket brand={brand} best={best} hasBest={hasBest} position={position} /></div>
      {/* 최고 오퍼는 메인 쿠폰에 이미 있으니 쿠폰으로 다시 그리지 않고, 상세 표만 메인 쿠폰 바로 아래에 둔다 */}
      {shown && best.map((o, i) => {
        const t = conditionTable(o)
        if (!t.rows.length && !t.note) return null
        return <DetailTable key={offerKey(o)} t={t} i={i} head={best.length > 1 ? <PlatformBadge platformKey={o.platform} brand={brand.name} /> : null}
                            onEnd={rest.length === 0 && i === best.length - 1 && phase === 'closing' ? () => setPhase(false) : undefined} />
      })}
      {/* 접힌 하위 라벨(쿠폰 아래 한 줄, 최대 3개). 배지는 붙이지 않는다. 펼치면 앱별 쿠폰이 대신해 CSS로 숨긴다. */}
      {rest.length > 0 && (
        <div className="cc-alts">
          {rest.slice(0, 3).map((o) => (
            <span key={offerKey(o)} className={`cc-alt${o.soldOut ? ' cc-alt--sold' : ''}`}><PlatformBadge platformKey={o.platform} brand={brand.name} />{amountText(o)}</span>
          ))}
        </div>
      )}
      <button type="button" className="cc-hint" aria-expanded={open} onClick={toggle}>
        {open ? '접기' : '자세히 보기'}
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {onHide && (
        <button type="button" className="cc-hide" aria-label={`${brand.name} 숨기기`} title="숨기기"
                onClick={() => onHide(brand.name, hasBest ? best[0].amount : null)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.2 6.7C3.9 8.2 3 10.2 3 12c0 2.5 4 7 9 7 1.6 0 3-.4 4.2-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
        </button>
      )}
      {/* 펼친 쿠폰은 펼쳤을 때만 그린다(접힌 동안 요소 수를 늘리지 않는다). */}
      {shown && rest.length > 0 && (
        <div className="cc-more">
          {rest.map((o, i) => {
            const f = formulaOf(o)
            const tags = badgesOf(o)
            const t = conditionTable(o)
            const hasTbl = t.rows.length > 0 || t.note
            const end = i === rest.length - 1 && phase === 'closing' ? () => setPhase(false) : undefined
            const anim = { '--i': i + best.length }
            const side = (tags.length > 0 || f) && (
              <span className="cc-side-tags">
                {tags.map((b) => <Tag key={b.kind} b={b} platform={o.platform} />)}
                {f && <span className="cc-fx">{f}</span>}
              </span>
            )
            return (
              <Fragment key={offerKey(o)}>
                <div className="cc-deal cc-deal--more" style={anim} onAnimationEnd={hasTbl ? undefined : end}>
                  <Coupon o={o} brand={brand} position={position} best={false} side={side} />
                </div>
                {hasTbl && <DetailTable t={t} i={i + best.length} onEnd={end} />}
              </Fragment>
            )
          })}
        </div>
      )}
    </article>
  )
}

export default memo(CouponCard)
