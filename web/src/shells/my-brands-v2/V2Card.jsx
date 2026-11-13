import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrandLogo } from '../../logos.jsx'
import { track } from '../../analytics.js'
import { useBackClose } from '../../backClose.js'
import { brandCardId } from '../../cardId.js'
import { brandImpressionProps, observeBrandImpression } from '../../brandImpression.js'
import OfferShareButton from '../../OfferShareButton.jsx'
import { cardOf } from './data.js'
import DetailSheet from './DetailSheet.jsx'
import { prefetchHistory } from './PriceChart.jsx'
import { Amount, Chip, ExternalIcon, GoButton, MinOrder, Reactions, offerLinkProps } from './parts.jsx'

// 홈 시안(my-brands-v2)의 카드 한 장. App.jsx가 운영 쿠폰 카드(CouponCard)에 주는 props를 그대로 받는다:
// brand, position(1부터), highlighted(#brand-이름이나 순위로 찾아온 카드), onInteract, include, onHide, onReact, reaction,
// leaving(숨기는 중), sharedKey와 onShareTargetVisible(공유 링크로 들어온 오퍼). 목록, 필터, 숨기기, 배너, 설문, 푸터 같은
// 나머지는 전부 App.jsx가 하고, 이 카드는 모양과 카드 안 동작만 맡는다.
function V2Card({ brand, position, highlighted, onInteract, include = null, onHide, onReact, reaction = 'none', leaving = false, sharedKey, onShareTargetVisible }) {
  const card = useMemo(() => cardOf(brand, include), [brand, include])
  const cardRef = useRef(null)
  const headRef = useRef(null)
  // 자세히 보기 시트: 열림, 닫는 중(그 자리에서 투명해지는 동안)
  const [sheet, setSheet] = useState(false)
  const [closing, setClosing] = useState(false)
  const openSheet = useCallback(() => { setClosing(false); setSheet(true) }, [])
  const closeSheet = useCallback(() => setClosing(true), [])
  const exitSheet = useCallback(() => { setSheet(false); setClosing(false) }, [])
  // 폰의 뒤로 버튼은 열려 있는 시트부터 닫는다(운영 카드와 같다).
  useBackClose(sheet, closeSheet)
  // 공유 링크로 들어온 오퍼가 이 카드 것이면 시트를 열고, 그 링크가 풀리면 닫는다(운영 카드와 같다).
  const previousSharedKey = useRef(null)
  useEffect(() => {
    if (sharedKey) openSheet()
    else if (previousSharedKey.current) setSheet(false)
    previousSharedKey.current = sharedKey
  }, [sharedKey, onShareTargetVisible, openSheet])
  // 찾아온 카드(#brand-이름, 인기 순위)는 화면 가운데로 간다. 공유 링크는 시트 안의 오퍼로 간다.
  useEffect(() => {
    if (highlighted && !sharedKey) cardRef.current?.scrollIntoView({ block: 'center' })
  }, [highlighted, sharedKey])
  // 카드 머리가 화면에 1초 보이면 brand_impression(운영 카드와 같은 기록).
  useEffect(() => observeBrandImpression(headRef.current, brandImpressionProps(brand, position),
    (p) => track('brand_impression', p)), [brand, position])

  if (!card) return null
  const link = offerLinkProps({ offer: card.offer, brand, position, best: card.hasBest, where: 'main' })
  // 세 영역: 머리(로고, 이름, 배지 / 오른쪽 위에 자세히 ⌄: 머리와 따로 카드 위에 얹은 독립 칸), 몸통(할인금액, 최소주문, 품절/오픈 전),
  // 발(남은 너비를 채운 앱 이동 버튼 / 오른쪽에 좋아요 하트와 공유).
  // 링크, 공유, 좋아요 밖을 누르면 자세히 보기 시트(운영 카드와 같은 brand_expand via sheet 기록).
  const onCardClick = (e) => {
    if (e.target.closest('a, .v2-share, .v2-react')) return
    onInteract?.()
    track('brand_expand', { brand: brand.name, category: brand.category ?? 'none', via: 'sheet' })
    openSheet()
  }
  return (
    <article
      id={brandCardId(brand.name)} ref={cardRef} data-brand={brand.name}
      className={`v2-card${highlighted ? ' v2-card--linked' : ''}${leaving ? ' v2-card--leaving' : ''}${card.state ? ' v2-card--dim' : ''}`}
      onPointerDown={() => prefetchHistory(card.name)} onClick={onCardClick}
    >
      <div className="v2-detail" aria-hidden="true">자세히<svg viewBox="0 0 12 12"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      <div className="v2-card__top">
        <span className="v2-card__head" ref={headRef}>
          <BrandLogo name={card.name} />
          <span className="v2-card__headtext">
            <span className="v2-card__name">{card.displayName}</span>
            {(card.isNew || card.chips.length > 0) && (
              <span className="v2-card__chips">
                {card.isNew && <Chip c={{ kind: 'new', text: '신규' }} />}
                {card.chips.map((c, i) => <Chip key={`${c.kind}${i}`} c={c} />)}
              </span>
            )}
          </span>
        </span>
      </div>
      {/* 1+1 묶음 행사: 운영 카드처럼 대표 금액 위 한 줄. 누르면 앱으로 간다(offer_link_click where main, slot bundle). */}
      {card.bundles.map(({ offer, label }) => (
        <a key={`${label}`} className="v2-bundle" {...offerLinkProps({ offer, brand, position, best: false, where: 'main', slot: 'bundle' })}>
          <span className="v2-bundle__tag">행사</span><b>{label}</b><ExternalIcon />
        </a>
      ))}
      <button type="button" className="v2-card__body" aria-haspopup="dialog">
        <Amount label={card.amountLabel} className="v2-card__amount" />
        <span className="v2-card__conds">
          <MinOrder label={card.minLabel} />
          {card.state && <span className="v2-chip v2-chip--state">{card.state}</span>}
        </span>
      </button>
      <div className="v2-card__foot">
        <GoButton link={link} platform={card.platform} appLabel={card.appLabel} />
        <div className="v2-card__side">
          <Reactions name={card.name} reaction={reaction} onReact={(pressed) => onReact?.(brand, pressed, position)} />
          <OfferShareButton offer={card.offer} brandName={card.name} position={position} where="card" className="v2-share" />
        </div>
      </div>
      {/* 시트는 문서 맨 위로 띄운다(카드의 변형 효과 안에 두면 fixed 위치가 틀어진다). 포털이라도 React 이벤트는 카드로 올라가 카드 클릭이
          시트를 다시 열므로 DetailSheet가 클릭을 여기서 끊는다. */}
      {sheet && createPortal(
        <DetailSheet
          card={card} position={position} include={include} closing={closing} sharedKey={sharedKey}
          onShareTargetVisible={onShareTargetVisible} onClose={closeSheet} onExited={exitSheet}
          onHide={onHide ? () => { setSheet(false); setClosing(false); onHide(brand.name, card.hasBest ? card.offer.amount : null) } : undefined}
        />, document.body)}
    </article>
  )
}

export default memo(V2Card)
