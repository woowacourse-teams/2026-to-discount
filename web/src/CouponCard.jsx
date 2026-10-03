// 메인 화면 A안 16차 브랜드 카드(쿠폰 티켓형). 표시 규칙: tracker docs/superpowers/specs/2026-10-03-home-a-display-model.md
// 쿠폰 구조는 늘 같다(앱 아이콘, 금액, 최소주문, 이동 꼭지). 배지와 계산식은 쿠폰 밖(또는 남는 칸)에 둔다.
// 폭을 재는 코드를 두지 않는다(총 차단 시간). 이름 크기는 글자 수로, 절취 홈은 CSS 마스크로 판다.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { track } from './analytics.js'
import { brandImpressionProps, observeBrandImpression } from './brandImpression.js'
import { brandCardId } from './BrandCard.jsx'
import { amountText, badgesOf, formulaOf, minLabel, nameFontPx, postitOf, splitOffers } from './couponModel.js'
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

function OfferLinkA({ offer, brand, position, best, className, children }) {
  const href = offerLink(offer, brand.links, brand.name)
  const web = href.startsWith('http')
  return (
    <a className={className} href={href}
       // 커스텀 스킴(coupangeats://, ddangyo://, baemin://)은 같은 탭에서 열어야 앱으로 간다(운영 칩과 같다).
       target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}
       aria-label={`${brand.name} ${amountText(offer)}, 앱으로 이동`}
       onClick={() => track('offer_link_click', offerClickProps({ offer, brandName: brand.name, position, best }))}>
      {children}
    </a>
  )
}

function Ticket({ brand, best, hasBest, position }) {
  if (best.length === 1) {
    const o = best[0]
    return (
      <OfferLinkA offer={o} brand={brand} position={position} best={hasBest} className={`cc-ticket${hasBest ? '' : ' cc-ticket--muted'}`}>
        <span className="cc-info">
          <PlatformBadge platformKey={o.platform} brand={brand.name} />
          <span><Amt offer={o} /><Min value={o.minOrderAmount} /></span>
        </span>
        <span className="cc-stub"><Go /></span>
      </OfferLinkA>
    )
  }
  // 동점 최고: 금액은 한 번, 앱마다 한 줄씩 각자 이동. 배지는 오른쪽 위 포스트잇.
  const postit = postitOf(best)
  return (
    <div className="cc-ticket-wrap">
      <div className="cc-ticket cc-ticket--tie">
        <span className="cc-info"><Amt offer={best[0]} /></span>
        <span className="cc-apps">
          {best.map((o) => (
            <OfferLinkA key={offerKey(o)} offer={o} brand={brand} position={position} best className="cc-app">
              <PlatformBadge platformKey={o.platform} brand={brand.name} />
              <Min value={o.minOrderAmount} />
              <Go />
            </OfferLinkA>
          ))}
        </span>
      </div>
      {postit.length > 0 && (
        <span className="cc-postit">
          {postit.map((b) => (
            <span key={`${b.platform}${b.kind}`} className={`cc-tag cc-tag--${b.kind}`} data-platform={b.platform}>
              {b.platform && <PlatformBadge platformKey={b.platform} brand={brand.name} />}{b.text}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

function CouponCard({ brand, position, highlighted, onInteract, include = null, onHide, leaving = false }) {
  const { best, rest, hasBest } = useMemo(() => splitOffers(brand.offers, include), [brand.offers, include?.random, include?.menu])
  const [open, setOpen] = useState(false)
  const cardRef = useRef(null)
  const headRef = useRef(null)
  const toggle = () => {
    onInteract?.()
    setOpen((v) => {
      if (!v) track('brand_expand', { brand: brand.name, category: brand.category ?? 'none' })
      return !v
    })
  }
  // 딥링크(#brand-이름)로 들어오면 펼친 채로 그 카드로 스크롤한다(운영 카드와 같다).
  useEffect(() => {
    if (highlighted) { setOpen(true); cardRef.current?.scrollIntoView({ block: 'center' }) }
  }, [highlighted])
  useEffect(() => observeBrandImpression(headRef.current, brandImpressionProps(brand, position),
    (p) => track('brand_impression', p)), [brand, position])

  const single = best.length === 1 ? best[0] : null
  const fx = single && formulaOf(single)
  return (
    <article id={brandCardId(brand.name)} ref={cardRef} data-brand={brand.name}
             className={`cc${open ? ' cc--open' : ''}${highlighted ? ' cc--highlighted' : ''}${leaving ? ' cc--leaving' : ''}`}>
      <div className="cc-side" ref={headRef}>
        <span className="cc-logo"><BrandLogo name={brand.name} /></span>
        {/* 접힌 하위 라벨. 배지는 붙이지 않는다. 펼치면 앱별 쿠폰이 대신한다. */}
        {!open && rest.map((o) => (
          <span key={offerKey(o)} className={`cc-alt${o.soldOut ? ' cc-alt--sold' : ''}`}><PlatformBadge platformKey={o.platform} brand={brand.name} />{amountText(o)}</span>
        ))}
      </div>
      <div className="cc-main">
        <div className="cc-name">
          <button type="button" aria-expanded={open} onClick={toggle}>
            <span className="cc-nm" style={{ fontSize: `${nameFontPx(brand.name)}px` }}>{brand.name}</span>
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
      {open && (
        <div className="cc-more">
          {[...best, ...rest].map((o) => {
            const f = formulaOf(o)
            const tags = badgesOf(o)
            return (
              <OfferLinkA key={offerKey(o)} offer={o} brand={brand} position={position} best={hasBest && best.includes(o)} className="cc-plat">
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
