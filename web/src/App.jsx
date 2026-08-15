import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fetchBanners, fetchBrands } from './api.js'
import { track } from './analytics.js'
import EventBanner from './EventBanner.jsx'
import { BrandLogo, PlatformBadge, PLATFORMS, PLATFORM_BY_KEY } from './logos.jsx'

// brands.yml에 브랜드별 링크가 없는 앱은 여기 링크로 앱만 연다.
// 전부 실기 ADB로 착지 화면까지 확인한 값이다(2026-08-05).
//
// yogiyo: 공유 링크가 살아 있고 "할인/혜택" 탭으로 정확히 떨어진다 —
// 셋 중 유일하게 목적지가 할인 화면이라 그대로 쓴다.
//
// coupangeats: 예전 공유 링크(share.coupangeats.com/RM8HgQyr64b)는
// 프로모션 딥링크였고 이제 "종료된 프로모션 입니다" 화면으로 떨어진다.
// 앱이 선언한 경로 중 할인 화면으로 가는 외부 딥링크는 없어서(와우컬렉션
// WebView URL은 앱 내부 전용, 2026-08-03 확인) 앱 홈만 연다.
//
// ddangyo: 브랜드별 gateway4.html 코드가 대부분 만료됐다("이벤트 준비중").
// 아직 살아있는 gateway.html 코드만 brands.yml에 남기고 나머지는 여기로
// 온다. 앱이 선언한 https 호스트(tblodr.ddangyo.com)는 App Links 검증이
// 안 돼 브라우저로 새니까 커스텀 스킴을 쓴다.
//
// ponytail: 커스텀 스킴이라 앱 미설치면 아무 일도 안 일어난다. 스토어로
// 흘리려면 intent:// + S.browser_fallback_url로 바꿔야 하는데, 그건
// 안드로이드 전용이라 iOS가 깨진다.
const PLATFORM_APP_LINKS = {
  coupangeats: 'coupangeats://',
  yogiyo: 'https://url.customer.yogiyo.co.kr/MUVJRHpYU2',
  ddangyo: 'ddangyo://',
  // capture/baemin.py의 BRAND_LOUNGE_DEEPLINK와 같은 주소 — 브랜드관
  // 목록으로 바로 간다(추측 아니라 캡처 파이프라인이 실기로 확인한 값).
  baemin: 'baemin://./webview?webview_url=' +
    'https%3A%2F%2Finapp-webview.baemin.com%2Fbrand-lounge',
}

// 브랜드별 링크(brandLinks)가 없고 PLATFORM_APP_LINKS도 앱만 여는 커스텀
// 스킴뿐인 플랫폼은 앱을 열어도 그 브랜드 화면으로 안 간다 — 최소한
// 검색이라도 되게 구글 검색으로 보낸다. 앱 안의 실제 브랜드 검색 딥링크
// 스킴은 확인된 게 없다(추측으로 만들면 안 열리는 경로를 또 만드는
// 꼴이라 안 쓴다). 배민은 브랜드관 목록 딥링크가 있어 검색 폴백이
// 필요 없다. 쿠팡이츠는 구글 검색으로 보내지 않는다 — 최소한 자기 앱은
// 열리게 두는 쪽을 택함(PLATFORM_APP_LINKS의 'coupangeats://'가 대신
// 적용된다).
const PLATFORM_SEARCH_QUERY = {
  ddangyo: '땡겨요',
}

function searchFallbackLink(platformKey, brandName) {
  const prefix = PLATFORM_SEARCH_QUERY[platformKey]
  if (!prefix) return null
  return `https://www.google.com/search?q=${encodeURIComponent(`${prefix} ${brandName}`)}`
}

// 필터 탭 목록. key는 API가 내려주는 brand.category 값과 맞춰야 한다
// (실제 브랜드별 분류는 API 쪽 brands.yml이 단일 출처다).
const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'chicken', label: '치킨' },
  { key: 'pizza', label: '피자' },
  { key: 'fastfood', label: '패스트푸드' },
  { key: 'snack', label: '분식' },
  { key: 'cafe', label: '카페' },
  { key: 'convenience', label: '편의점' },
  { key: 'korean', label: '한식' },
  { key: 'chinese', label: '중식' },
]

// 멤버십/지역화폐 반영 로직은 아직 없다. delivery-discount-api 레포의
// docs/specs/2026-07-28-product-brief.md에 "UI만 배치, 로직 보류"로 명시된
// 의도적 보류 상태 — 계산 모델이 나오면 그 레포 docs/plans에 계획이 생긴다.
const MEMBERSHIP_OPTIONS = [
  { key: 'baemin', label: '배민클럽' },
  { key: 'coupangeats', label: '쿠팡와우' },
  { key: 'yogiyo', label: '요기패스' },
  { key: 'ddangyo', label: '지역화폐' },
]
const MEMBERSHIP_LABEL = Object.fromEntries(MEMBERSHIP_OPTIONS.map((m) => [m.key, m.label]))

function won(value) {
  return `${value.toLocaleString()}원`
}

// 브랜드 카드 딥링크용 id. 브랜드명 자체가 이미 유니크한 키라 그대로
// 쓰되, 공백만 앵커에서 다루기 까다로우니 치환한다.
function brandCardId(name) {
  return `brand-${name.trim().replace(/\s+/g, '_')}`
}

function offerAmountText(offer) {
  return offer.amount != null ? won(offer.amount) : offer.rawText
}

// 같은 앱이라도 쿠폰이 주문금액 구간별로 차등일 수 있어, 항상 "할인금액 -
// 최소주문금액" 쌍의 리스트로 본다. 구간이 있으면 그 목록 그대로, 없으면
// 지금 아는 값(최상단 금액 + 최소주문금액) 한 줄짜리 목록으로 취급한다 —
// 렌더링 쪽에서 "구간이 있을 때만 리스트"와 "없을 때 단일 값" 두 갈래로
// 안 갈라져도 된다.
function detailRows(offer) {
  if (offer.tiers?.length > 0) return [...offer.tiers].sort((a, b) => b.amount - a.amount)
  return [{ minOrder: offer.minOrderAmount, amount: offer.amount }]
}

// brandLinks는 API가 내려주는 앱별 브랜드 쿠폰 바로가기(brands.yml 출처,
// 플랫폼 키 -> 링크). 그 앱 오퍼에만 건다 — 예를 들어 땡겨요 링크를
// 배민 칩에 걸면 안 된다. 브랜드별 링크가 없으면 PLATFORM_APP_LINKS(쿠팡
// 이츠·요기요만 해당)로 대신 앱을 연다. 그마저 없는 칩은 상세를 여는
// 버튼이 된다(링크가 있는 칩은 링크가 우선이라 카드 헤더로 펼친다).
function OfferChip({ offer, brandLinks, brandName, detailId, open, onToggle, best, hero, wide }) {
  const held = offer.status === 'held'
  const showRangeBadge = offer.qualifier !== null
  // "최대"는 최소주문금액을 채워야 나오는 상한액이다 — 액면대로 읽히지
  // 않도록 칩 전체를 흐리게 깔아 다른 확정값과 구분한다.
  const capped = offer.qualifier === '최대'
  const link = brandLinks?.[offer.platform]
    ?? searchFallbackLink(offer.platform, brandName)
    ?? PLATFORM_APP_LINKS[offer.platform]

  const content = (
    <>
      <span className="offer__amount">
        {/* 최고와 qualifier는 동시에 붙지 않는다(조건 붙은 값은 최고
            후보에서 빠진다) — 같은 자리, 같은 배지를 색만 바꿔 쓴다. */}
        {/* 최고 할인은 칩 왼쪽에 라벨로 붙인다 — 금액 위에 떠 있던
            배지는 카드가 여럿 늘어서면 어느 칩 것인지 헷갈렸다. */}
        {best && (
          <span className="offer__best-label" aria-label="최고 할인">
            <span>최고</span>
            <span>할인</span>
          </span>
        )}
        {/* 위 칸(qualifier 자리)은 금액의 성격을 말한다 — "최대 할인
            금액"이나 "n%할인"처럼 그 숫자가 어떻게 나온 값인지. 아래
            칸은 멤버십·조건 배지 몫이다. */}
        {!best && showRangeBadge && (
          <span className="offer__range-badge">
            {offer.qualifier === '최대' ? '최대 할인 금액' : offer.qualifier}
          </span>
        )}
        {!best && !showRangeBadge && /^\d+%할인$/.test(offer.badge || '') && (
          <span className="offer__range-badge offer__range-badge--rate">{offer.badge}</span>
        )}
        {/* "배민클럽 전용쿠폰" 같은 원문 대신 이름만 남긴다 — 칩이 이미
            그 앱 하나로 정해져 있으니 "전용쿠폰"은 군더더기다. 그 외
            배지("선착순" 등)는 원문 그대로 둔다. */}
        {offer.badge && (
          offer.badge.endsWith('전용쿠폰') ? (
            <span className="offer__status-badge offer__status-badge--membership" data-platform={offer.platform}>
              {MEMBERSHIP_LABEL[offer.platform] ?? offer.badge}
            </span>
          ) : (
            !/^\d+%할인$/.test(offer.badge) && (
              <span className="offer__status-badge">{offer.badge}</span>
            )
          )
        )}
        {offer.soldOut ? (
          <>
            <s className="offer__amount--soldout">{offerAmountText(offer)}</s>
            <span className="offer__soldout-label">품절</span>
          </>
        ) : offerAmountText(offer)}
      </span>
      <span className="offer__icon-badge">
        <PlatformBadge platformKey={offer.platform} />
      </span>
    </>
  )

  return (
    <li className={`offer ${held ? 'offer--held' : 'offer--confirmed'}${best ? ' offer--best' : ''}${capped ? ' offer--capped' : ''}${hero ? ' offer--hero' : ''}${wide ? ' offer--wide' : ''}`}>
      {link ? (
        <a
          className="offer__chip offer__chip--link"
          href={link}
          // 커스텀 스킴(coupangeats://, ddangyo://, baemin://)은 새 탭에서
          // 열면 브라우저가 about:blank만 띄우고 인텐트를 넘기지 않는다.
          // 같은 탭에서 열어야 앱으로 간다. http(s) 링크만 새 탭에 둔다.
          target={link.startsWith('http') ? '_blank' : undefined}
          rel={link.startsWith('http') ? 'noreferrer' : undefined}
          onClick={() => track('offer_link_click', { brand: brandName, platform: offer.platform })}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          className="offer__chip offer__chip--toggle"
          aria-expanded={open}
          aria-controls={detailId}
          title={open ? '눌러서 접기' : '눌러서 자세히 보기'}
          onClick={onToggle}
        >
          {content}
          <span className="sr-only">상세 조건 {open ? '접기' : '펼치기'}</span>
        </button>
      )}
    </li>
  )
}

// 칩 하나를 펼쳤을 때 나오는 상세 한 칸. 아직 안 채워진 값(최소주문금액,
// 구간 할인)은 감추지 않고 "미확인"으로 드러낸다 — 없다는 사실 자체가
// 사용자에게 필요한 정보이고, 채워지면 이 자리에 그대로 들어온다.
function OfferDetail({ offer }) {
  const platform = PLATFORM_BY_KEY[offer.platform]
  const rows = detailRows(offer)

  return (
    <div className="detail">
      {/* 금액은 칩 버튼과 아래 쿠폰 목록에 이미 있다 — 헤더에 또 찍지 않는다. */}
      <div className="detail__head">
        <PlatformBadge platformKey={offer.platform} />
        <span className="detail__platform">{platform?.label ?? offer.platform}</span>
        {offer.status === 'held' && <span className="pill pill--pending">재확인</span>}
      </div>

      <dl className="detail__rows">
        <dt>할인/조건</dt>
        <dd>
          <ul className="detail__tiers">
            {rows.map((t, i) => (
              <li key={i} className="detail__tier">
                <span className="detail__tier-amount">
                  {t.amount == null ? (
                    <span className="detail__unknown">금액 미확인</span>
                  ) : t.soldOut ? (
                    <>
                      <s className="detail__tier-amount--soldout">{won(t.amount)}</s>
                      <span className="offer__soldout-label">품절</span>
                    </>
                  ) : won(t.amount)}
                </span>
                <span className="detail__tier-min">
                  {t.minOrder != null
                    ? `${won(t.minOrder)} 이상 주문 시`
                    : <span className="detail__unknown">최소주문 미확인</span>}
                  {/* 구간마다 끝나는 날이 다를 수 있다 — 배민 청년피자는
                      일반 08-30, 배민클럽 08-31로 하루 차이다. 오퍼 전체의
                      만료일과 같으면 굳이 줄마다 반복하지 않는다. */}
                  {t.expiresAt && t.expiresAt !== offer.expiresAt && (
                    <span className="detail__tier-expiry">~{t.expiresAt.slice(5).replace('-', '.')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {offer.conditions && <p className="detail__condition-note">{offer.conditions}</p>}
        </dd>
      </dl>
    </div>
  )
}

// 데이터가 오기 전 자리를 지키는 카드 모양. 실제 카드와 같은 그리드라
// 도착 순간 레이아웃이 튀지 않는다.
function BrandGridSkeleton() {
  return (
    <div className="brand-grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="brand-card brand-card--skeleton">
          <div className="skeleton-head">
            <span className="skeleton-box skeleton-box--logo" />
            <span className="skeleton-box skeleton-box--name" />
          </div>
          <div className="skeleton-offers">
            {Array.from({ length: 4 }, (_, j) => (
              <span key={j} className="skeleton-box skeleton-box--offer" />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">할인 정보를 불러오는 중입니다.</span>
    </div>
  )
}

// 브랜드 하나 = 카드 하나. 1행 = 로고+이름, 2행 = 앱별 금액(수평 나열).
// 카드 여러 개가 한 줄에 2~3개씩 반응형으로 놓인다(.brand-grid).
// highlighted는 URL 해시(#brand-이름)로 이 카드를 콕 집어 공유했을 때만
// true — 스크롤해서 보여주고 테두리를 강조한다. 카드를 만지면
// onInteract로 App에 알려 하이라이트를 끈다(계속 남아있으면 거슬린다).
function BrandCard({ brand, highlighted, onInteract }) {
  // qualifier="최대"인 오퍼는 금액과 무관하게 항상 맨 뒤로 민다 —
  // confirmed든 held든, "최대"는 실제 최소주문금액을 채워야 진짜 값이
  // 나오는 상한액이라 액면 그대로 다른 확정값과 비교하면 왜곡된다.
  // 같은 최대군끼리·같은 비최대군끼리는 금액 큰 순.
  // 그 브랜드에서 가장 큰 확정 할인액. 조건이 붙은 값(qualifier)과 품절은
  // 비교에서 뺀다 — 같은 선에서 견줄 수 없는 값이다. 동점이면 동점인
  // 만큼 전부 표시한다(하나만 고르면 거짓 우열이 생긴다). 하나뿐이어도
  // 그 값이 그 브랜드에서 받을 수 있는 최고다 — 그대로 표시한다.
  const bestAmount = useMemo(() => {
    const plain = brand.offers.filter((o) => !o.qualifier && o.amount != null && !o.soldOut)
    if (plain.length === 0) return null
    return Math.max(...plain.map((o) => o.amount))
  }, [brand.offers])

  const sortedOffers = useMemo(
    () => [...brand.offers].sort((a, b) => {
      const aMax = a.qualifier === '최대' ? 1 : 0
      const bMax = b.qualifier === '최대' ? 1 : 0
      if (aMax !== bMax) return aMax - bMax
      return (b.amount ?? -1) - (a.amount ?? -1)
    }),
    [brand.offers],
  )

  // 최고 할인 하나를 단독으로 올리고 나머지를 아래로 내린다.
  // sortedOffers가 이미 "최대 뒤로, 금액 큰 순"으로 정렬돼 있으므로
  // 맨 앞이 곧 그 브랜드의 대표 할인이다.
  const [heroOffer, ...restOffers] = sortedOffers

  // 상세를 펼친 상태를 기본으로 둔다 — 조건(최소주문금액 등)을 봐야
  // 금액이 실제로 무슨 뜻인지 알 수 있는데, 접어두면 매번 눌러야 했다.
  // 접기는 여전히 가능하다.
  const [pinned, setPinned] = useState(true)
  const open = pinned
  const detailId = `${useId()}-detail`
  const cardRef = useRef(null)

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

  return (
    <article
      id={brandCardId(brand.name)}
      ref={cardRef}
      className={`brand-card ${open ? 'brand-card--open' : ''} ${highlighted ? 'brand-card--highlighted' : ''}`}
    >
      <button
        type="button"
        className="brand-card__head"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={toggle}
      >
        <BrandLogo name={brand.name} />
        <h2 className="brand-card__name">{brand.name}</h2>
        {/* 화살표 왼쪽 안내 문구. 마우스가 있는 환경에서 hover할 때만
            드러난다(App.css @media (hover: hover)) — 펼치지는 않는다,
            펼침은 클릭 전용. 여기에 원본 캡처 미리보기를 넣지 않는다:
            판독 근거는 상세를 펼쳐야 보는 정보지 스치며 보는 정보가
            아니고, 브랜드 수만큼 이미지를 hover마다 물면 무겁다. */}
        <span className="brand-card__hover-affordance">
          <span className="brand-card__hover-hint" aria-hidden="true">눌러서 펼치기</span>
          <span className="brand-card__chevron" aria-hidden="true" />
        </span>
        <span className="sr-only">상세 조건 {open ? '접기' : '펼치기'}</span>
      </button>

      {/* 최고 할인 하나를 단독 줄로 올리고 나머지는 아래 가로 그리드로
          내린다. 넷을 균등한 격자에 늘어놓으면 "어느 게 제일 센가"를
          매번 눈으로 비교해야 한다 — 답을 먼저 보여주고, 나머지는
          비교하고 싶을 때 보는 부가 정보로 둔다. */}
      {heroOffer && (
        <ul className="offer-list offer-list--hero">
          <OfferChip
            key={heroOffer.platform}
            offer={heroOffer}
            brandLinks={brand.links}
            brandName={brand.name}
            detailId={detailId}
            open={open}
            onToggle={toggle}
            best={bestAmount != null && !heroOffer.qualifier && !heroOffer.soldOut
                  && heroOffer.amount === bestAmount}
            hero
          />
        </ul>
      )}

      {restOffers.length > 0 && (
        <ul className="offer-list offer-list--rest">
          {restOffers.map((o) => (
            <OfferChip
              key={o.platform}
              offer={o}
              brandLinks={brand.links}
              brandName={brand.name}
              detailId={detailId}
              open={open}
              onToggle={toggle}
              best={bestAmount != null && !o.qualifier && !o.soldOut && o.amount === bestAmount}
              // 차순위가 하나뿐이면 그 칩이 줄 전체를 차지한다 — 폭이
              // 남으므로 로고를 모서리가 아니라 흐름 안에 놓는다.
              wide={restOffers.length === 1}
            />
          ))}
        </ul>
      )}

      {/* 상세는 펼쳤을 때만 그린다. 캡처 원본이 스크린샷 한 장에 1MB가 넘어,
          브랜드 73개 × 앱 4개어치를 미리 심어두면 첫 화면이 통째로 멎는다.
          컨테이너는 aria-controls 대상이라 접혀 있어도 남겨둔다. */}
      <div id={detailId} className="brand-detail" hidden={!open}>
        {open && sortedOffers.map((o) => <OfferDetail key={o.platform} offer={o} />)}
      </div>
    </article>
  )
}

// 이 서비스가 무엇이고 무엇이 아닌지, 정보를 어떻게 모았는지 밝힌다.
// 앱 화면 캡처를 그대로 올리던 갤러리는 뺐다 — 금액은 사실이라 옮겨
// 적을 수 있지만 캡처 이미지 자체는 각 플랫폼의 저작물이다.
function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        개인이 만든 <strong>비영리 정보 제공</strong> 페이지입니다. 광고나 제휴 수수료를 받지 않습니다.
        배달의민족·쿠팡이츠·요기요·땡겨요와 <strong>제휴 관계가 없으며</strong> 각 사의 공식 서비스가 아닙니다.
      </p>
      <p>
        할인 정보는 각 앱에서 <strong>누구나 볼 수 있는 화면</strong>을 사람이 직접 보고 옮겨 적은 것입니다.
        자동 수집(크롤링)이나 기술적 접근 제한 우회는 하지 않습니다.
      </p>
      <p>
        금액은 <strong>확인일 기준</strong>이며 지역·매장·회원 등급·시간대에 따라 다를 수 있습니다.
        브랜드를 눌러 조건을 확인하고, <strong>주문 전에 각 앱에서 실제 금액을 다시 확인하세요.</strong>
      </p>
      <p>
        어떤 화면이 실제로 쓰이는지 보려고 방문 통계를 씁니다. 하나는 직접 만든
        <strong> 익명 통계</strong>로, 자체 서버에만 기록하고 페이지 조회·머문 시간·어떤 브랜드를
        펼쳤는지 정도만 봅니다. <strong>이름·연락처 같은 개인정보와 IP 원본은 저장하지 않으며</strong>,
        브라우저의 <strong>추적 안 함(DNT/GPC)</strong> 설정이 켜져 있으면 아무것도 보내지 않습니다.
        다른 하나는 배포 플랫폼(Vercel)이 제공하는 <strong>쿠키 없는 집계형 통계</strong>(Vercel Analytics)로,
        방문자 개인을 특정하지 않는 페이지뷰 수준의 정보만 봅니다. 둘 다 광고 목적으로 쓰지 않습니다.
      </p>
      <p>
        재방문 여부를 더 정확히 보려고 <strong>Google Analytics(GA4)를 임시로</strong> 함께
        사용합니다. 위 두 통계와 달리 <strong>쿠키를 사용하며 데이터가 Google로 전달</strong>됩니다.
        저희 쪽에서 광고 개인화·Google Signals는 껐고, 위와 동일하게 추적 안 함(DNT/GPC)
        설정이 켜져 있으면 적용하지 않습니다. 트래픽 정확도 확보를 위한 임시 조치이며
        목적을 달성하면 제거할 예정입니다.
      </p>
      <p className="site-footer__fine">
        브랜드명과 로고는 해당 브랜드를 가리키기 위해서만 사용했으며, 모든 상표는 각 권리자에게 있습니다.
        수정 요청이나 삭제 요청은 저장소 이슈로 알려주세요.
      </p>
    </footer>
  )
}

// 브랜드 검색 — 기본은 작은 버튼. 누르면 입력창으로 바뀌어 레이블 자리를
// 덮고, 포커스를 잃으면(바깥을 누르거나 다른 곳으로 이동) 다시 버튼으로
// 돌아간다. 검색어 자체는 버튼 상태에서도 App의 search 상태에 남아
// 필터링은 계속 적용된다 — UI만 접힌다.
function SearchControl({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div className={`search-control ${open ? 'search-control--open' : ''}`}>
      {open ? (
        <input
          ref={inputRef}
          type="search"
          className="search-control__input"
          placeholder="브랜드 검색"
          aria-label="브랜드 검색"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="search-control__btn"
          aria-label="브랜드 검색 열기"
          onClick={() => setOpen(true)}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      )}
    </div>
  )
}


export default function App() {
  const [brands, setBrands] = useState(null)
  const [banners, setBanners] = useState([])
  const [error, setError] = useState(null)
  const [filterKey, setFilterKey] = useState('all')
  const [search, setSearch] = useState('')

  // 헤더의 플랫폼 배지를 눌러 그 앱에 오퍼가 있는 브랜드만 본다.
  // 처음엔 전부 선택된 상태다 — 빈 Set(=필터 없음)을 기본으로 두면
  // 선택·미선택·기본 세 가지 모양이 생겨 무엇이 켜져 있는지 헷갈렸다.
  const [platformFilter, setPlatformFilter] = useState(() => new Set(PLATFORMS.map((p) => p.key)))
  const togglePlatform = (key) => {
    setPlatformFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
    track('platform_filter_toggle', { platform: key })
  }

  // 멤버십 라벨은 타이틀바 아래 여백에 떠 있어서, 스크롤해서 카드가
  // 올라오면 카드 위에 덩그러니 남는다 — 맨 위에서만 보이게 한다.
  const [atTop, setAtTop] = useState(true)
  // "맨 위로" 버튼은 한참 내려갔을 때만 — 조금 내려간 상태에선 방해다.
  const [scrolledFar, setScrolledFar] = useState(false)
  useEffect(() => {
    const onScroll = () => {
      setAtTop(window.scrollY < 8)
      setScrolledFar(window.scrollY > 400)
      // 고무줄 스크롤 차단(html/body의 overscroll-behavior:none, App.css)은
      // 흔들 때 타이틀바가 같이 밀리는 걸 막지만, 그 값 그대로 두면 당겨서
      // 새로고침(pull-to-refresh)도 같이 막힌다. 맨 위(scrollY 0)일 때만
      // 풀어준다 — 그 지점에서만 아래로 당기는 제스처가 새로고침 의도이고,
      // 스크롤이 이미 내려간 상태의 흔들림 방지는 그대로 유지된다.
      // documentElement가 아니라 body에 건다 — html(루트)이 auto일 때만
      // "뷰포트 오버스크롤 값은 body를 따른다"는 전파 규칙이 적용된다.
      // (App.css에서 html에는 이제 규칙을 안 준다.)
      document.body.style.overscrollBehaviorY = window.scrollY <= 0 ? 'auto' : 'none'
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 타이틀바는 position:fixed다 — sticky는 문서에 붙어 있어서 오버스크롤이나
  // 스크롤 지연에 함께 밀렸다. 흐름에서 빠진 높이는 스페이서가 대신 차지하고,
  // 그 높이는 바를 실측해 따라간다.
  const titleBarRef = useRef(null)
  const [barHeight, setBarHeight] = useState(0)
  useLayoutEffect(() => {
    const el = titleBarRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setBarHeight(entry.contentRect.height))
    ro.observe(el)
    setBarHeight(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [])

  // 멤버십 필터는 아직 안 만들었다. 버튼은 자리와 색을 미리 잡아두되
  // 누르면 상태가 바뀌지 않고 "구현 예정"만 알린다 — 눌렀는데 아무 일도
  // 안 일어나면 고장으로 읽힌다. 수요는 그대로 집계한다.
  const [membershipHint, setMembershipHint] = useState(null)
  const toggleMembership = (key) => {
    setMembershipHint(key)
    setTimeout(() => setMembershipHint((cur) => (cur === key ? null : cur)), 1600)
    track('membership_toggle', { platform: key, state: 'soon' })
  }

  const isFiltered = filterKey !== 'all' || platformFilter.size < PLATFORMS.length || search.trim() !== ''
  const resetFilters = () => {
    setFilterKey('all')
    setPlatformFilter(new Set(PLATFORMS.map((p) => p.key)))
    setSearch('')
    track('filters_reset')
  }

  // URL 해시(#brand-이름)로 카드 하나를 콕 집어 공유할 수 있게 한다.
  // 해시가 바뀌면(같은 페이지 안에서 다른 링크로 다시 들어와도) 다시
  // 반영한다 — 새로고침 없이 링크만 바꿔도 그 카드로 스크롤돼야 한다.
  const [linkedBrand, setLinkedBrand] = useState(null)
  useEffect(() => {
    const applyHash = () => {
      const raw = window.location.hash.slice(1)
      setLinkedBrand(raw ? decodeURIComponent(raw) : null)
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  // reloadKey를 올리면 다시 부른다 — 실패 화면의 "다시 시도" 버튼용.
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let alive = true
    setError(null)
    setBrands(null)
    fetchBrands()
      .then((v) => { if (alive) setBrands(v) })
      .catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [reloadKey])

  // 배너 실패는 삼킨다. 카드 그리드와 달리 배너는 부가 정보라, 못 불러왔다는
  // 사실을 화면에 띄울 이유가 없다 — 빈 목록과 같게 다룬다.
  useEffect(() => {
    fetchBanners().then(setBanners).catch(() => setBanners([]))
  }, [])

  const tabs = CATEGORIES

  // category는 API가 brands.yml에서 읽어 내려준다. 분류가 없는 브랜드는
  // null이라 "전체"에서만 보인다. 검색은 항상 같이 적용된다.
  const visibleBrands = useMemo(() => {
    if (!brands) return brands
    const q = search.trim()
    return brands.filter((b) => {
      const inSearch = q === '' || b.name.includes(q)
      if (!inSearch) return false
      if (platformFilter.size > 0 && !b.offers.some((o) => platformFilter.has(o.platform))) return false
      if (filterKey === 'all') return true
      return b.category === filterKey
    })
  }, [brands, filterKey, search, platformFilter])

  // 화살표를 눌러 아래로 펼치면 스크롤 띠 대신 여러 줄 그리드로 카테고리
  // 전부를 한 번에 보여준다. 카테고리를 실제로 고르면 다시 접는다 —
  // 펼쳐둔 채로 남으면 매번 화면을 도로 차지한다.
  const [catExpanded, setCatExpanded] = useState(false)
  const handleFilterSelect = (key) => {
    setCatExpanded(false)
    setFilterKey(key)
    if (key !== filterKey) {
      track('category_change', { category: key })
      // 분류를 바꾸면 목록 자체가 갈리므로 보던 위치는 의미가 없다.
      // 순간이동이다(smooth 아님) — 새 목록을 훑는 게 목적이지
      // 이동 과정을 보여주는 게 목적이 아니다.
      window.scrollTo(0, 0)
    }
  }

  return (
    <>
      {/* 배너가 0건이거나 호출이 실패하면 아무것도 그리지 않는다(EventBanner가
          null을 돌려준다). 카드 그리드의 "불러오기 실패"와 다르게 다룬다 —
          배너는 부가 정보라서 실패가 화면을 어지럽히면 안 된다. */}
      <EventBanner banners={banners} />
      {/* 플랫폼 배지와 카테고리 탭을 한 스크롤 영역에 같이 넣는다. main 밖에 두어 full-bleed가 100vw 트릭 없이 자연히 성립하고, sticky도 안 깨진다. */}

      {/* 고정된 바가 문서 흐름에서 빠진 만큼을 대신 차지하는 자리. 높이는
          바를 실측해서 넣는다(탭 줄바꿈·폰트 로딩으로 바뀔 수 있다). */}
      <div className="title-bar-spacer" style={{ height: `${barHeight}px` }} aria-hidden="true" />
      <div className="title-bar" ref={titleBarRef}>
        <div className="title-bar__inner">
          <h1 className="sr-only">오늘의할인 — 배달앱 브랜드 할인 비교</h1>

          <div className="page-head__apps" aria-label="비교 대상 배달앱">
            {PLATFORMS.map((p) => (
              <span key={p.key} className="platform-badge-wrap">
                <PlatformBadge
                  platformKey={p.key}
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePlatform(p.key)
                  }}
                  active={platformFilter.has(p.key)}
                />

                {/* 고른 앱에만 멤버십 버튼이 로고 밑에 붙는다. 2초 뒤
                    사라지는 칸으로 물어보던 걸 걷었다 — 켜고 끄는 걸
                    언제든 다시 만질 수 있어야 한다. 위치로 어느 앱
                    것인지 드러나므로 여러 앱을 한 줄로 묶지 않는다. */}
                {platformFilter.has(p.key) && (
                  <button
                    type="button"
                    className="membership-btn membership-btn--soon"
                    data-platform={p.key}
                    data-hint={membershipHint === p.key ? 'on' : undefined}
                    aria-disabled="true"
                    title="구현 예정입니다"
                    onClick={() => toggleMembership(p.key)}
                  >
                    {MEMBERSHIP_LABEL[p.key]}
                  </button>
                )}
              </span>
            ))}
          </div>

          {/* 분류·초기화·검색은 앱 버튼과 같은 선상에 둔다 — 별도 줄로
              띄우면 같은 조작 묶음인데도 따로 노는 것처럼 보였다.
              좁은 화면에서는 "카테고리 설정" 글자를 접고 아이콘만 남긴다. */}
          <button
            type="button"
            className={`category-toggle${catExpanded ? ' category-toggle--open' : ''}${filterKey !== 'all' ? ' category-toggle--active' : ''}`}
            aria-expanded={catExpanded}
            aria-label="카테고리 설정"
            onClick={() => setCatExpanded((v) => !v)}
          >
            <span className="category-toggle__label">CATEGORY</span>
          </button>
          <button
            type="button"
            className={`filter-reset-btn${isFiltered ? ' filter-reset-btn--active' : ''}`}
            onClick={resetFilters}
            aria-label="필터 초기화"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <SearchControl value={search} onChange={setSearch} />

        </div>
        {/* 카테고리 목록 — 토글을 눌렀을 때만 바 아래로 펼쳐진다.
            absolute라 카드 그리드를 밀어내지 않는다. */}
        {catExpanded && (
          <div className="category-panel" role="listbox" aria-label="카테고리 선택">
            {tabs.map((c) => (
              <button
                key={c.key}
                type="button"
                role="option"
                aria-selected={filterKey === c.key}
                className={`category-panel__item${filterKey === c.key ? ' category-panel__item--active' : ''}`}
                onClick={() => handleFilterSelect(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

      </div>
    <main>

      {error && (
        <div className="load-error" role="alert">
          <p className="load-error__title">할인 정보를 불러오지 못했습니다.</p>
          <p className="load-error__detail">{error}</p>
          <button
            type="button"
            className="load-error__retry"
            onClick={() => { setReloadKey((k) => k + 1); track('brands_retry') }}
          >
            다시 시도
          </button>
        </div>
      )}
      {/* 빈 화면에 글자 한 줄 대신 들어올 카드 모양을 미리 깔아둔다 —
          도착했을 때 레이아웃이 튀지 않는다. */}
      {!error && !brands && <BrandGridSkeleton />}

      {visibleBrands && visibleBrands.length === 0 && (
        <p className="msg">
          {search.trim() ? `"${search}" 검색 결과가 없습니다.` : '이 분류엔 브랜드가 없습니다.'}
        </p>
      )}

      {visibleBrands && visibleBrands.length > 0 && (
        // key를 필터 키로 걸어 분류를 바꿀 때마다 이 상자를 새로 마운트한다
        // — 안 그러면 카드들이 자리를 지킨 채 내용만 뚝 바뀌어(리스트
        // diff) 다른 브랜드로 순간이동한 것처럼 튄다. 새로 마운트되면
        // fade-in 애니메이션이 다시 걸려 "갈아치웠다"가 아니라 "다음
        // 목록이 떠올랐다"로 읽힌다.
        <div className="brand-grid" key={filterKey}>
          {visibleBrands.map((b) => (
            <BrandCard
              key={b.name}
              brand={b}
              highlighted={linkedBrand === brandCardId(b.name)}
              onInteract={() => setLinkedBrand(null)}
            />
          ))}
        </div>
      )}

      <SiteFooter />

      {/* 한참 내려간 뒤 맨 위로 돌아가는 길. */}
      {scrolledFar && (
        <button
          type="button"
          className="to-top-btn"
          onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); track('scroll_to_top') }}
          aria-label="맨 위로"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </main>
    </>
  )
}
