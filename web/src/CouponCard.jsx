// 메인 화면 A안 16차 브랜드 카드(쿠폰 티켓형). 표시 규칙: tracker docs/superpowers/specs/2026-10-03-home-a-display-model.md
// 쿠폰 구조는 늘 같다(앱 아이콘, 금액, 최소주문, 이동 꼭지). 배지와 계산식은 쿠폰 밖(또는 남는 칸)에 둔다.
// 폭을 재는 코드를 두지 않는다(총 차단 시간). 이름 크기는 글자 수로, 절취 홈은 CSS 마스크로 판다.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { track } from './analytics.js'
import { brandImpressionProps, observeBrandImpression } from './brandImpression.js'
import { brandCardId } from './BrandCard.jsx'
import { amountText, badgesOf, formulaOf, minLabel, nameCutPx, splitOffers } from './couponModel.js'
import { offerKey } from './filters.js'
import { BrandLogo, PlatformBadge } from './logos.jsx'
import { offerClickProps, offerLink } from './offerLink.js'
import './styles/coupon-card.css'

const Go = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h9v9M16 4L5 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
)
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
function Amt({ offer, small }) {
  return (
    <span className={`cc-amt${small ? ' cc-amt--sm' : ''}`}>
      {offer.soldOut ? <><s>{amountText(offer)}</s><em className="cc-soldout">품절</em></> : amountText(offer)}
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

function Coupon({ o, brand, position, best, muted }) {
  return (
    <OfferLinkA offer={o} brand={brand} position={position} best={best} className={`cc-ticket${muted ? ' cc-ticket--muted' : ''}`}>
      <span className="cc-info">
        <PlatformBadge platformKey={o.platform} brand={brand.name} />
        <span><Amt offer={o} /><Min value={o.minOrderAmount} /></span>
      </span>
      <span className="cc-stub"><Go /></span>
    </OfferLinkA>
  )
}

// 동점 최고: 오퍼마다 단독 쿠폰과 같은 쿠폰 하나, 가로 캐러셀(CSS 스크롤 스냅)에 나란히. 배지는 그 쿠폰 오른쪽 위 포스트잇.
// 현재 위치 점은 IntersectionObserver로만 갱신한다(스크롤 이벤트, 폭 재기 없음). 서버 렌더와 마운트 전에는 첫 점이 켜져 있다.
function Carousel({ brand, best, position }) {
  const [idx, setIdx] = useState(0)
  const ref = useRef(null)
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
      <div className="cc-carousel" ref={ref}>
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

function Ticket({ brand, best, hasBest, position }) {
  if (best.length === 1) return <Coupon o={best[0]} brand={brand} position={position} best={hasBest} muted={!hasBest} />
  return <Carousel brand={brand} best={best} position={position} />
}

function CouponCard({ brand, position, highlighted, onInteract, include = null, onHide, leaving = false }) {
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
  useEffect(() => { // 움직임을 줄인 환경은 애니메이션이 없어 animationend가 안 온다
    if (phase === 'closing' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPhase(false)
  }, [phase])
  useEffect(() => observeBrandImpression(headRef.current, brandImpressionProps(brand, position),
    (p) => track('brand_impression', p)), [brand, position])

  const single = best.length === 1 ? best[0] : null
  const fx = single && formulaOf(single)
  return (
    <article id={brandCardId(brand.name)} ref={cardRef} data-brand={brand.name}
             className={`cc${open ? ' cc--open' : ''}${highlighted ? ' cc--highlighted' : ''}${leaving ? ' cc--leaving' : ''}`}>
      <div className="cc-side" ref={headRef}>
        <span className="cc-logo"><BrandLogo name={brand.name} size={64} /></span>
        {/* 접힌 하위 라벨. 배지는 붙이지 않는다. 펼치면 앱별 쿠폰이 대신한다. */}
        {rest.map((o) => (
          <span key={offerKey(o)} className={`cc-alt${o.soldOut ? ' cc-alt--sold' : ''}`}><PlatformBadge platformKey={o.platform} brand={brand.name} />{amountText(o)}</span>
        ))}
      </div>
      <div className="cc-main">
        <div className="cc-name">
          <button type="button" aria-expanded={open} onClick={toggle}>
            <span className="cc-nm" style={{ '--cut': `${nameCutPx(brand.name)}px` }}>{brand.name}</span>
          </button>
          {single && badgesOf(single).map((b) => <Tag key={b.kind} b={b} platform={single.platform} />)}
        </div>
        {fx && <div className="cc-fx">{fx}</div>}
        <div className="cc-deal"><Ticket brand={brand} best={best} hasBest={hasBest} position={position} /></div>
        <button type="button" className="cc-hint" aria-expanded={open} onClick={toggle}>
          {open ? '접기' : '눌러서 자세히 보기'}
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {onHide && (
        <button type="button" className="cc-hide" aria-label={`${brand.name} 숨기기`} title="숨기기"
                onClick={() => onHide(brand.name, hasBest ? best[0].amount : null)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.2 6.7C3.9 8.2 3 10.2 3 12c0 2.5 4 7 9 7 1.6 0 3-.4 4.2-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
        </button>
      )}
      {/* 펼친 쿠폰은 펼쳤을 때만 그린다(접힌 동안 요소 수를 늘리지 않는다). */}
      {shown && (
        <div className="cc-more">
          {[...best, ...rest].map((o, i, all) => {
            const f = formulaOf(o)
            const tags = badgesOf(o)
            return (
              <OfferLinkA key={offerKey(o)} offer={o} brand={brand} position={position} best={hasBest && best.includes(o)} className="cc-plat" style={{ '--i': i }}
                onAnimationEnd={i === all.length - 1 && phase === 'closing' ? () => setPhase(false) : undefined}>
                <span className="cc-pi">
                  <PlatformBadge platformKey={o.platform} brand={brand.name} />
                  <span><Amt offer={o} small /><Min value={o.minOrderAmount} /></span>
                  {(tags.length > 0 || f) && (
                    <span className="cc-side-tags">
                      {tags.length > 0 && <span className="cc-tags">{tags.map((b) => <Tag key={b.kind} b={b} platform={o.platform} />)}</span>}
                      {f && <span className="cc-fx">{f}</span>}
                    </span>
                  )}
                </span>
                <span className="cc-ps"><Go /></span>
              </OfferLinkA>
            )
          })}
        </div>
      )}
    </article>
  )
}

export default memo(CouponCard)
