import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { track } from './analytics.js'
import { brandImpressionProps, observeBrandImpression } from './brandImpression.js'
import { comparable, displayBestAmount, offerKey } from './filters.js'
import { BrandLogo } from './logos.jsx'
import OfferChip from './OfferChip.jsx'
import OfferDetail from './OfferDetail.jsx'

// 브랜드 카드 딥링크용 id. 브랜드명 자체가 이미 유니크한 키라 그대로
// 쓰되, 공백만 앵커에서 다루기 까다로우니 치환한다.
export function brandCardId(name) {
  return `brand-${name.trim().replace(/\s+/g, '_')}`
}

function captureBrandImpression(props) {
  track('brand_impression', props)
}

// 브랜드 하나 = 카드 하나. 1행 = 로고+이름, 2행 = 앱별 금액(수평 나열).
// 카드 여러 개가 한 줄에 2~3개씩 반응형으로 놓인다(.brand-grid).
// highlighted는 URL 해시(#brand-이름)로 이 카드를 콕 집어 공유했을 때만
// true — 스크롤해서 보여주고 테두리를 강조한다. 카드를 만지면
// onInteract로 App에 알려 하이라이트를 끈다(계속 남아있으면 거슬린다).
export default function BrandCard({ brand, position, highlighted, onInteract, include = null, onHide, leaving = false, hideTip = false, onHideTipClose }) {
  // qualifier="최대"인 오퍼는 금액과 무관하게 항상 맨 뒤로 민다 —
  // confirmed든 held든, "최대"는 실제 최소주문금액을 채워야 진짜 값이
  // 나오는 상한액이라 액면 그대로 다른 확정값과 비교하면 왜곡된다.
  // 같은 최대군끼리·같은 비최대군끼리는 금액 큰 순.
  // 그 브랜드에서 가장 큰 확정 할인액. 조건이 붙은 값(qualifier)과 품절은
  // 비교에서 뺀다 — 같은 선에서 견줄 수 없는 값이다. 동점이면 동점인
  // 만큼 전부 표시한다(하나만 고르면 거짓 우열이 생긴다). 하나뿐이어도
  // 그 값이 그 브랜드에서 받을 수 있는 최고다 — 그대로 표시한다.
  //
  // filters.js의 bestConfirmedAmount를 그대로 안 쓴다(Task 18 결론). 그 함수는 정렬
  // 천장을 채우려고 특정메뉴 쿠폰뿐인 브랜드에 MENU_LIMITED_SORTING_AMOUNT(4,999원)를
  // 끼워 넣는데 — 화면에 4,999원을 진짜 가격처럼 찍으면 안 된다. 여기서는 comparable로
  // 넣을지만 가르고 금액은 항상 오퍼의 액면(o.amount)만 쓴다 — 토글 꺼진 특정메뉴는
  // comparable이 false라 애초에 안 낀다. 규칙은 하나(RULES 3)인데 "정렬 순서"와
  // "화면에 찍을 값"이 갈라야 해서 두 자리에 산다. 판정표는 sortingAmount 쪽 하나만
  // 검사하므로 어긋나면 filters.test.js가 먼저 잡는다.
  const bestAmount = useMemo(
    () => displayBestAmount(brand.offers, include),
    [brand.offers, include?.random, include?.menu])

  const sortedOffers = useMemo(
    () => [...brand.offers].sort((a, b) => {
      const aMax = a.qualifier === '최대' ? 1 : 0
      const bMax = b.qualifier === '최대' ? 1 : 0
      if (aMax !== bMax) return aMax - bMax
      return (b.amount ?? -1) - (a.amount ?? -1)
    }),
    [brand.offers],
  )

  const isBest = (o) => bestAmount != null && comparable(o, include) && !o.soldOut && o.amount === bestAmount

  // 최고 할인을 위로 올리고 나머지를 아래로 내린다. 동점이면 동점인 만큼
  // 전부 올린다 — 같은 금액인데 하나만 크게 놓으면 나머지가 열등해 보여
  // 거짓 우열이 생긴다(bestAmount가 동점을 그대로 두는 이유와 같다).
  // 최고가 없는 브랜드(전부 조건부거나 품절)는 sortedOffers가 이미
  // "최대 뒤로, 금액 큰 순"이라 맨 앞이 대표값이다.
  const [heroOffers, restOffers] = useMemo(() => {
    const best = sortedOffers.filter(isBest)
    return best.length > 0
      ? [best, sortedOffers.filter((o) => !isBest(o))]
      : [sortedOffers.slice(0, 1), sortedOffers.slice(1)]
  }, [sortedOffers, bestAmount])

  // 상세를 펼친 상태를 기본으로 둔다 — 조건(최소주문금액 등)을 봐야
  // 금액이 실제로 무슨 뜻인지 알 수 있는데, 접어두면 매번 눌러야 했다.
  // 접기는 여전히 가능하다.
  const [pinned, setPinned] = useState(true)
  const open = pinned
  const detailId = `${useId()}-detail`
  const cardRef = useRef(null)
  const headerRef = useRef(null)

  // 어떤 브랜드를 실제로 열어보는지가 "무엇을 궁금해하는가"의 지표다.
  // 접는 동작은 안 남긴다 — 관심 신호가 아니다.
  const toggle = () => {
    onInteract?.()
    setPinned((v) => {
      if (!v) track('brand_expand', { brand: brand.name, category: brand.category ?? 'none' })
      return !v
    })
  }

  // 딥링크로 콕 집어 왔다는 건 이미 그 브랜드가 궁금해서 온 것 —
  // 펼쳐서 바로 보여준다. 관심 신호(track)는 실제 클릭에만 남긴다.
  useEffect(() => {
    if (highlighted) {
      setPinned(true)
      cardRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [highlighted])

  useEffect(() => observeBrandImpression(
    headerRef.current,
    brandImpressionProps(brand, position),
    captureBrandImpression,
  ), [brand, position])

  return (
    <article
      id={brandCardId(brand.name)}
      ref={cardRef}
      className={`brand-card ${open ? 'brand-card--open' : ''} ${highlighted ? 'brand-card--highlighted' : ''}${leaving ? ' brand-card--leaving' : ''}`}
      data-brand={brand.name}
    >
      {/* 헤더는 이름표다. 펼침 트리거는 카드 아래 한 곳뿐이다 —
          헤더 전체·화살표·아래 버튼 셋이 같은 일을 하면 어느 것을
          눌러야 하는지 생각하게 된다. */}
      <div className="brand-card__head" ref={headerRef}>
        <BrandLogo name={brand.name} />
        <h2 className="brand-card__name">{brand.name}</h2>
      </div>

      {/* 카드 오른쪽 위. 헤더 버튼의 형제라 눌러도 카드가 안 펼쳐진다. */}
      {onHide && (
        <button
          type="button"
          className="brand-card__hide"
          aria-label={`${brand.name} 숨기기`}
          title="숨기기"
          onClick={() => onHide(brand.name, bestAmount)}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18" />
            <path d="M10.6 5.2A9.6 9.6 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1" />
            <path d="M6.2 6.7C3.9 8.2 3 10.2 3 12c0 2.5 4 7 9 7 1.6 0 3-.4 4.2-1.1" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        </button>
      )}
      {onHide && hideTip && (
        <div className="hide-tip" role="note">
          <span>선호하지 않는 브랜드는<br />이 버튼으로 숨길 수 있어요</span>
          <button type="button" className="hide-tip__close" aria-label="알겠어요" onClick={onHideTipClose}>✕</button>
        </div>
      )}

      {/* 최고 할인을 단독 줄로 올리고 나머지는 아래 가로 그리드로
          내린다. 동점이면 그만큼 줄이 늘어난다. 넷을 균등한 격자에 늘어놓으면 "어느 게 제일 센가"를
          매번 눈으로 비교해야 한다 — 답을 먼저 보여주고, 나머지는
          비교하고 싶을 때 보는 부가 정보로 둔다. */}
      {heroOffers.length > 0 && (
        <ul className="offer-list offer-list--hero">
          {heroOffers.map((o) => (
            <OfferChip
              include={include}
              position={position}
              key={offerKey(o)}
              offer={o}
              brandLinks={brand.links}
              brandName={brand.name}
              detailId={detailId}
              open={open}
              onToggle={toggle}
              best={isBest(o)}
              hero
            />
          ))}
        </ul>
      )}

      {restOffers.length > 0 && (
        <ul className="offer-list offer-list--rest">
          {restOffers.map((o) => (
            <OfferChip
              include={include}
              position={position}
              key={offerKey(o)}
              offer={o}
              brandLinks={brand.links}
              brandName={brand.name}
              detailId={detailId}
              open={open}
              onToggle={toggle}
              best={isBest(o)}
            />
          ))}
        </ul>
      )}

      {/* 상세는 펼쳤을 때만 그린다. 캡처 원본이 스크린샷 한 장에 1MB가 넘어,
          브랜드 73개 × 앱 4개어치를 미리 심어두면 첫 화면이 통째로 멎는다.
          컨테이너는 aria-controls 대상이라 접혀 있어도 남겨둔다. */}
      <div id={detailId} className="brand-detail" hidden={!open}>
        {open && sortedOffers.map((o) => <OfferDetail key={offerKey(o)} offer={o} brandName={brand.name} />)}
      </div>

      {/* 카드 맨 아래 줄 — 담기와 펼치기. 펼치기를 헤더에서 내린 건
          헤더가 로고·이름만 갖게 하려는 것이고, 담기와 나란히 두면
          "이 카드로 할 수 있는 일"이 한자리에 모인다. */}
      <div className="brand-card__foot">
        <button
          type="button"
          className="brand-card__expand"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={toggle}
        >
          {open ? '접기' : '자세히'}
          <span className="brand-card__chevron" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}
