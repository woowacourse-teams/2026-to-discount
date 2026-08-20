import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fetchBanners, fetchBrands } from './api.js'
import { setFilterContext, track } from './analytics.js'
import EventBanner from './EventBanner.jsx'
import { BrandLogo, PlatformBadge, PLATFORMS, PLATFORM_BY_KEY } from './logos.jsx'
import FilterSheet from './FilterSheet.jsx'
import MenuBar from './MenuBar.jsx'
import TopBarA from './TopBarA.jsx'
import { uiVariant } from './variant.js'
import { CATEGORIES, MEMBERSHIP_LABEL, applyFilters, defaultFilters, isDefaultFilters } from './filters.js'

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

const CART_KEY = 'dk_cart'

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
function OfferChip({ offer, brandLinks, brandName, detailId, open, onToggle, best, hero }) {
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
            {offer.qualifier === '최대' ? '불확정' : offer.qualifier}
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
    <li className={`offer ${held ? 'offer--held' : 'offer--confirmed'}${best ? ' offer--best' : ''}${capped ? ' offer--capped' : ''}${hero ? ' offer--hero' : ''}`}>
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
                  {/* percent가 있으면 이 금액이 정률 계산 결과다(요기요
                      cumulative 실측 2026-08-19: "18,000원 이상 3,000원 +
                      25,000원 이상 5%(최대 3,000원)"에서 두 번째 줄이
                      percent 없이 "25,000원 이상 1,250원"으로만 보이면
                      마치 별개 정액 쿠폰처럼 읽힌다 — 정률이라는 사실
                      자체가 사라진다). 금액 옆에 %와 상한을 병기한다. */}
                  {t.percent != null && (
                    <span className="detail__tier-percent">
                      ({t.percent}%{t.cap != null && t.cap !== t.amount ? `, 최대 ${won(t.cap)}` : ''})
                    </span>
                  )}
                  {/* 같은 브랜드에 배달용과 포장용 쿠폰이 따로 걸리기도
                      한다(땡겨요 바른치킨). 어느 쪽에 쓰는 금액인지가
                      금액 바로 옆에 있어야 헷갈리지 않는다. */}
                  {t.channel && <span className="detail__channel">{t.channel}</span>}
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
function BrandCard({ brand, highlighted, onInteract, checked, onToggleCheck }) {
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
      {/* 헤더는 이름표다. 펼침 트리거는 카드 아래 한 곳뿐이다 —
          헤더 전체·화살표·아래 버튼 셋이 같은 일을 하면 어느 것을
          눌러야 하는지 생각하게 된다. */}
      <div className="brand-card__head">
        <BrandLogo name={brand.name} />
        <h2 className="brand-card__name">{brand.name}</h2>
      </div>

      {/* 담기 + 버튼. 헤더 버튼의 형제라 눌러도 카드가 안 펼쳐진다.
          아래 담기 줄과 같은 동작이고, 스크롤 중에 카드 아래까지 안 가도
          바로 담을 수 있는 지름길이다. */}
      <button
        type="button"
        className={`brand-card__add${checked ? ' brand-card__add--on' : ''}`}
        aria-pressed={checked}
        aria-label={checked ? `${brand.name} 담기 해제` : `${brand.name} 담기`}
        title={checked ? '담기 해제' : '담기'}
        onClick={() => onToggleCheck(brand.name)}
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          {checked
            ? <polyline points="20 6 9 17 4 12" />
            : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>}
        </svg>
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

      {/* 카드 맨 아래 줄 — 담기와 펼치기. 펼치기를 헤더에서 내린 건
          헤더가 로고·이름만 갖게 하려는 것이고, 담기와 나란히 두면
          "이 카드로 할 수 있는 일"이 한자리에 모인다. */}
      <div className="brand-card__foot">
        <button
          type="button"
          className={`brand-card__save${checked ? ' brand-card__save--on' : ''}`}
          aria-pressed={checked}
          onClick={() => onToggleCheck(brand.name)}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            {checked
              ? <polyline points="20 6 9 17 4 12" />
              : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>}
          </svg>
          {checked ? '담김' : '담기'}
        </button>

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
        <strong> 익명 통계</strong>로 자체 서버에 기록하고, 같은 화면 행동을 제품 사용 흐름
        분석을 위해 브라우저에서 <strong>PostHog</strong>로 직접 전달합니다.
        자체 서버에는 IP 원본을 저장하지 않고, PostHog에는 이름·연락처를
        보내지 않으며 쿠키도 사용하지 않습니다.
        브라우저의 <strong>추적 안 함(DNT/GPC)</strong> 설정이 켜져 있으면 아무것도 보내지 않습니다.
        배포 플랫폼의 <strong>쿠키 없는 집계형 통계</strong>(Vercel Analytics)도 페이지뷰 수준으로 사용하며,
        이 통계들은 광고 목적으로 쓰지 않습니다.
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

// 브랜드 검색 — 버튼은 자리를 지키고, 입력창은 카테고리 목록처럼 바 아래로
// 펼쳐진다. 줄 안에서 폭을 넓히면 옆 조작들이 밀려 배치가 매번 다시
// 잡혔다. 열려 있는 동안 버튼은 색을 뒤집어 지금 무엇이 켜져 있는지
// 알린다. 검색어는 접어도 App의 search 상태에 남아 필터링은 계속 걸린다.
/**
 * 상시 노출 검색 입력. 예전에는 돋보기 버튼을 눌러야 패널이 열렸는데,
 * 로고 자리를 이 입력으로 바꾸면서 접을 이유가 없어졌다 — 바에서 가장
 * 넓은 자리를 차지하는 것이 곧 이 화면의 주된 조작이라는 뜻이다.
 *
 * 입력하는 동안에는 목록이 흔들리지 않는다. 엔터나 돋보기로 확정해야
 * 필터가 걸린다 — 글자마다 다시 거르면 지우는 중에도 결과가 요동친다.
 */
function SearchControl({ value, onChange, chips }) {
  const [draft, setDraft] = useState(value)

  // 바깥에서 검색어를 지우면(칩의 X, 초기화) 입력창도 따라 비어야 한다.
  useEffect(() => { setDraft(value) }, [value])

  const submit = () => onChange(draft.trim())

  return (
    <div className="search-field">
      {/* 걸린 조건은 검색창 안에 토큰으로 앉는다. 바 아래 따로 줄을
          두면 조건이 없을 때 빈 줄이 남고, 있을 때는 검색과 필터가
          서로 다른 층에 있는 것처럼 보인다 — 둘 다 "지금 무엇을
          보고 있는가"를 말하는 같은 정보다. */}
      {chips}
      <input
        type="search"
        className="search-field__input"
        placeholder="브랜드 검색"
        aria-label="브랜드 검색"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') { setDraft(''); onChange('') }
        }}
      />
      <button type="button" className="search-field__submit" aria-label="검색" onClick={submit}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </div>
  )
}


export default function App() {
  const [brands, setBrands] = useState(null)
  const [banners, setBanners] = useState([])
  const [error, setError] = useState(null)
  // 앱·분류·정렬·검색을 한 덩어리로 든다. 시트가 draft를 만들어 통째로
  // 돌려주므로 낱개 상태로 쪼개 두면 "적용" 한 번에 여러 setState가 나가
  // 중간 상태로 한 번 더 그려진다.
  const [filters, setFilters] = useState(defaultFilters)
  const [sheetOpen, setSheetOpen] = useState(false)

  const { search } = filters
  const setSearch = (v) => setFilters((f) => ({ ...f, search: typeof v === 'function' ? v(f.search) : v }))

  // 메뉴바에서 분류를 켜고 끈다 — 여기서는 바로 반영한다(시트와 달리
  // 조건 하나만 빠르게 만지는 자리다).
  const toggleCategory = (key) => {
    setFilters((f) => {
      const next = new Set(f.categories)
      if (next.has(key)) next.delete(key); else next.add(key)
      return { ...f, categories: next }
    })
    track('category_change', { category: key })
  }

  const applyFromSheet = (draft) => {
    setFilters(draft)
    setSheetOpen(false)
    track('filters_apply', {
      platforms: draft.platforms.size,
      categories: draft.categories.size,
      sort: `${draft.sortKey}_${draft.sortDir}`,
    })
  }

  // "맨 위로" 버튼은 한참 내려갔을 때만 — 조금 내려간 상태에선 방해다.
  const [scrolledFar, setScrolledFar] = useState(false)
  useEffect(() => {
    const onScroll = () => {
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

  const isFiltered = !isDefaultFilters(filters)
  const resetFilters = () => {
    setFilters(defaultFilters())
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


  // category는 API가 brands.yml에서 읽어 내려준다. 분류가 없는 브랜드는
  // null이라 "전체"에서만 보인다. 검색은 항상 같이 적용된다.
  // 플랫폼 토글은 카드를 거르는 게 아니라 그 앱의 오퍼를 켜고 끈다.
  // 전에는 "켜진 앱 오퍼가 하나라도 있으면 카드를 통째로 남긴다"라서,
  // 배민을 꺼도 배민 칩이 그대로 붙어 있었다 — 끈 앱 금액이 화면에
  // 남아 있으면 토글이 무슨 일을 했는지 알 수 없다.
  //
  // 오퍼를 걷어내고 나서 남는 게 없는 카드는 뺀다. 그 브랜드에서 볼
  // 것이 하나도 없는데 이름만 남기면 빈 카드가 격자를 채운다.
  // 담아둔 브랜드. 비교하려고 몇 개를 골라두면 스크롤을 오가지 않고
  // 그것만 모아 볼 수 있다. 브랜드명이 곧 키다(API가 별칭을 이미 대표명
  // 하나로 합쳐 내려준다). localStorage라 새로고침해도 남고, 사이트
  // 데이터를 지우면 끊긴다 — visitorId와 같은 한계다.
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY)
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  })
  const [cartOnly, setCartOnly] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify([...cart]))
    } catch {
      /* 사파리 프라이빗 등 — 못 적으면 이번 세션에만 남는다 */
    }
  }, [cart])

  const toggleCart = (name) => {
    setCart((prev) => {
      const next = new Set(prev)
      const adding = !next.has(name)
      if (adding) next.add(name); else next.delete(name)
      track('cart_toggle', { brand: name, state: adding ? 'add' : 'remove' })
      return next
    })
  }

  // 담은 게 하나도 없으면 모아보기를 켜둔 채로 둘 이유가 없다 — 빈
  // 화면만 남는다.
  useEffect(() => {
    if (cart.size === 0) setCartOnly(false)
  }, [cart.size])

  // 조건이 하나라도 바뀌면 이 값이 바뀌고, 그러면 카드 격자가 새로
  // 마운트돼 등장 애니메이션이 다시 걸린다. 정렬만 바꿔도 순서가 통째로
  // 달라지므로 분류와 똑같이 "새 목록"으로 다룬다.
  // 링크를 누른 순간 어떤 조건이 걸려 있었는지가 "분류를 설정한 사람이
  // 실제로 이동까지 하는가"의 답이다. A안과 같은 키를 쓴다 — 이름이
  // 다르면 두 안을 나란히 못 놓는다.
  useEffect(() => {
    setFilterContext({
      fCategory: filters.categories.size === 0 ? 'all' : [...filters.categories].sort().join('+'),
      fPlatforms: filters.platforms.size,
      fSearch: filters.search.trim() !== '' || undefined,
      fCart: cartOnly || undefined,
      fSaved: cart.size || undefined,
      fSort: `${filters.sortKey}_${filters.sortDir}`,
    })
  }, [filters, cartOnly, cart.size])

  const gridKey = [
    [...filters.categories].sort().join('|'),
    [...filters.platforms].sort().join('|'),
    filters.sortKey,
    filters.sortDir,
    filters.search.trim(),
    cartOnly ? 'cart' : '',
  ].join('/')

  // 조건이 바뀌면 목록 자체가 갈리므로 보던 위치는 의미가 없다. 맨 위로
  // 올려 새 목록을 처음부터 보게 한다 — 첫 렌더에는 건너뛴다(들어오자마자
  // 스크롤이 튀면 안 된다).
  const firstGrid = useRef(true)
  useEffect(() => {
    if (firstGrid.current) {
      firstGrid.current = false
      return
    }
    window.scrollTo(0, 0)
  }, [gridKey])

  // 필터·정렬 규칙은 filters.js가 단일 출처다(시트·메뉴바와 같은 규칙).
  const visibleBrands = useMemo(
    () => (brands ? applyFilters(brands, filters, { cart, cartOnly }) : brands),
    [brands, filters, cart, cartOnly],
  )


  // A안은 조건을 바에 전부 펼쳐 두고, B안은 바텀시트에 감춘다. 바 아래는
  // 두 안이 완전히 같다 — 카드도 배너도 계측도 하나의 코드를 쓴다. 갈라진
  // 브랜치로 두면 공통 부분을 고칠 때마다 두 번 하고, 한쪽을 빠뜨린다.
  const variantA = uiVariant === 'a'

  return (
    <>
      {/* 배너가 0건이거나 호출이 실패하면 아무것도 그리지 않는다(EventBanner가
          null을 돌려준다). 카드 그리드의 "불러오기 실패"와 다르게 다룬다 —
          배너는 부가 정보라서 실패가 화면을 어지럽히면 안 된다. */}
      {!variantA && (
        <FilterSheet
          open={sheetOpen}
          filters={filters}
          onApply={applyFromSheet}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {/* 고정된 바가 문서 흐름에서 빠진 만큼을 대신 차지하는 자리. 높이는
          바를 실측해서 넣는다(폰트 로딩·줄바꿈으로 바뀔 수 있다). */}
      <div className="title-bar-spacer" style={{ height: `${barHeight}px` }} aria-hidden="true" />

      {variantA ? (
        <TopBarA
          barRef={titleBarRef}
          filters={filters}
          setFilters={setFilters}
          search={search}
          setSearch={setSearch}
          cart={cart}
          cartOnly={cartOnly}
          setCartOnly={setCartOnly}
          isFiltered={isFiltered}
          resetFilters={resetFilters}
        />
      ) : (
      /* 상단 바: 선형 메뉴바 한 줄 + 그 아래 조작 한 줄. 플랫폼 배지는
         시트로 옮겼다 — 앱·분류·정렬이 한 자리에 모여야 무엇이 걸려
         있는지 한 번에 읽힌다. 바에 남는 건 자주 만지는 것뿐이다. */
      <div className="title-bar" ref={titleBarRef}>
        {/* 1행 — 이름과 상시 조작(검색·담아둔 것). 배달앱들이 쓰는 구조
            그대로다: 위는 정체성과 도구, 아래는 분류. */}
        <div className="title-bar__top">
          <h1 className="sr-only">오늘의할인 — 배달앱 브랜드 할인 비교</h1>

          {/* 로고가 있던 자리를 검색 입력이 차지한다. 바에서 가장 넓은
              자리를 쓰는 것이 곧 이 화면의 주된 조작이라는 뜻이다 —
              이름은 스크린리더용으로만 남긴다. */}
          <SearchControl
            value={search}
            onChange={setSearch}
            chips={(
              <>
                {/* 모아보기가 켜지면 다른 조건이 안 먹는다 — 결과가 왜
                    이런지 알려면 그 사실만 보여야 한다. */}
                {/* 칩 전체가 해제 버튼이다. ×만 눌리게 두면 손가락으로는
                    너무 작은 과녁이라, 칩을 눌렀는데 아무 일도 안 일어난다.
                    ×는 무엇이 일어날지 알려주는 표시로만 남긴다. */}
                {cartOnly && (
                  <button type="button" className="search-chip search-chip--cart"
                    aria-label="전체 보기" onClick={() => setCartOnly(false)}>
                    담아둔 {cart.size}개
                    <span className="search-chip__x" aria-hidden="true">×</span>
                  </button>
                )}
                {!cartOnly && CATEGORIES.filter((c) => filters.categories.has(c.key)).map((c) => (
                  <button type="button" className="search-chip" key={c.key}
                    aria-label={`${c.label} 해제`} onClick={() => toggleCategory(c.key)}>
                    {c.label}
                    <span className="search-chip__x" aria-hidden="true">×</span>
                  </button>
                ))}
                {!cartOnly && filters.platforms.size < PLATFORMS.length && (
                  <button type="button" className="search-chip" aria-label="앱 선택 초기화"
                    onClick={() => setFilters((f) => ({ ...f, platforms: new Set(PLATFORMS.map((x) => x.key)) }))}>
                    앱 {filters.platforms.size}
                    <span className="search-chip__x" aria-hidden="true">×</span>
                  </button>
                )}
              </>
            )}
          />

          <div className="title-bar__tools">
            {/* 초기화 · 필터 · 담아둔 것 순. 왼쪽 검색에서 오른쪽으로
                갈수록 범위가 넓은 조작이다. */}
            <button
              type="button"
              className={`icon-btn${isFiltered ? ' icon-btn--active' : ''}`}
              // 되돌릴 것이 없으면 누를 수 없다. 늘 눌리는 채로 두면 눌러본
              // 뒤에야 아무 일도 안 일어난다는 걸 알게 된다.
              disabled={!isFiltered}
              onClick={resetFilters}
              aria-label="필터 초기화"
              title={isFiltered ? '필터 초기화' : '되돌릴 필터가 없습니다'}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </button>

            <button
              type="button"
              // 열려 있으면 반전, 닫혀 있어도 조건이 걸려 있으면 드러낸다 —
              // 시트를 닫고 나면 필터가 걸린 목록인지 알 길이 없었다.
              className={`icon-btn${sheetOpen ? ' icon-btn--on' : isFiltered ? ' icon-btn--active' : ''}`}
              aria-expanded={sheetOpen}
              aria-label="필터 열기"
              title="필터"
              onClick={() => { setSheetOpen(true); track('filter_sheet_open') }}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="10" y1="17" x2="14" y2="17" />
              </svg>
            </button>

            {/* 담아둔 브랜드만 모아 본다. 개수를 배지로 달아 몇 개
                담았는지 열지 않고도 안다. */}
            <button
              type="button"
              className={`cart-btn${cartOnly ? ' cart-btn--on' : ''}`}
              aria-pressed={cartOnly}
              disabled={cart.size === 0}
              aria-label={cartOnly ? '전체 보기' : '담아둔 브랜드만 보기'}
              title={cart.size === 0 ? '담아둔 브랜드가 없다' : (cartOnly ? '전체 보기' : '담아둔 것만 보기')}
              onClick={() => {
                setCartOnly((v) => {
                  track('cart_view_toggle', { state: v ? 'off' : 'on', count: cart.size })
                  return !v
                })
              }}
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="20" r="1.4" />
                <circle cx="18" cy="20" r="1.4" />
                <path d="M2 3h3l2.4 12.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L21 7H6" />
              </svg>
              {cart.size > 0 && <span className="cart-btn__count">{cart.size}</span>}
            </button>
          </div>
        </div>

        <MenuBar
          selected={filters.categories}
          onToggle={toggleCategory}
        />

        {/* 걸린 필터·초기화·검색은 메뉴바 아래 한 줄로. 지금 뭐가 걸려
            있는지(칩)와 그걸 푸는 수단(X·초기화)이 같은 줄에 있어야 한다. */}
      </div>
      )}

      {/* 배너는 바 아래에 둔다. 흐름 맨 위에 두면 fixed인 타이틀바가
          그 자리를 덮어 스크롤하기 전에는 안 보였다. */}
      <EventBanner banners={banners} />
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

      {/* 담아둔 것만 보는 중이라는 표시와 비우는 길. 검색창 토큰은
          "지금 무엇을 보는가"를 말하고, 이 줄은 "그래서 무엇을 할 수
          있는가"를 말한다 — 비우기를 토큰 옆에 두면 X(모아보기 끄기)와
          뜻이 헷갈린다. */}
      {cartOnly && (
        <div className="cart-bar">
          <span className="cart-bar__label">담아둔 브랜드 {cart.size}개</span>
          <button
            type="button"
            className="cart-bar__clear"
            onClick={() => {
              track('cart_clear', { count: cart.size })
              setCart(new Set())
            }}
          >
            비우기
          </button>
        </div>
      )}

      {visibleBrands && visibleBrands.length === 0 && (
        <p className="msg">
          {cartOnly
            ? '담아둔 브랜드가 없습니다.'
            : (search.trim() ? `"${search}" 검색 결과가 없습니다.` : '이 분류엔 브랜드가 없습니다.')}
        </p>
      )}

      {visibleBrands && visibleBrands.length > 0 && (
        // key를 필터 키로 걸어 분류를 바꿀 때마다 이 상자를 새로 마운트한다
        // — 안 그러면 카드들이 자리를 지킨 채 내용만 뚝 바뀌어(리스트
        // diff) 다른 브랜드로 순간이동한 것처럼 튄다. 새로 마운트되면
        // fade-in 애니메이션이 다시 걸려 "갈아치웠다"가 아니라 "다음
        // 목록이 떠올랐다"로 읽힌다.
        <div className="brand-grid" key={gridKey}>
          {visibleBrands.map((b) => (
            <BrandCard
              key={b.name}
              brand={b}
              highlighted={linkedBrand === brandCardId(b.name)}
              onInteract={() => setLinkedBrand(null)}
              checked={cart.has(b.name)}
              onToggleCheck={toggleCart}
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
