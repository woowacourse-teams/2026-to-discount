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
  { key: 'coupangeats', label: '쿠팡 와우' },
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
function OfferChip({ offer, brandLinks, brandName, detailId, open, onToggle }) {
  const held = offer.status === 'held'
  const showRangeBadge = offer.qualifier !== null
  const link = brandLinks?.[offer.platform]
    ?? searchFallbackLink(offer.platform, brandName)
    ?? PLATFORM_APP_LINKS[offer.platform]

  const content = (
    <>
      <span className="offer__amount">
        {showRangeBadge && <span className="offer__range-badge">{offer.qualifier}</span>}
        {offer.badge && <span className="offer__status-badge">{offer.badge}</span>}
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
    <li className={`offer ${held ? 'offer--held' : 'offer--confirmed'}`}>
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
  const sortedOffers = useMemo(
    () => [...brand.offers].sort((a, b) => {
      const aMax = a.qualifier === '최대' ? 1 : 0
      const bMax = b.qualifier === '최대' ? 1 : 0
      if (aMax !== bMax) return aMax - bMax
      return (b.amount ?? -1) - (a.amount ?? -1)
    }),
    [brand.offers],
  )

  // 펼침은 클릭으로만 한다. 마우스가 있는 환경에서 hover로 바로 펼치면
  // 지나가기만 해도 카드마다 내용이 들쭉날쭉 늘어나 산만했다 — 지금은
  // hover가 "눌러서 자세히 보기" 안내만 띄운다(CSS ::after, App.css).
  const [pinned, setPinned] = useState(false)
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

      <ul className="offer-list">
        {sortedOffers.map((o) => (
          <OfferChip
            key={o.platform}
            offer={o}
            brandLinks={brand.links}
            brandName={brand.name}
            detailId={detailId}
            open={open}
            onToggle={toggle}
          />
        ))}
      </ul>

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

// 세그먼트 컨트롤(segmented control) — 탭이 각자 배경을 켜고 끄는 대신,
// 하나의 하이라이트가 활성 탭의 실측 위치·너비로 슬라이드된다. 라벨
// 길이가 제각각이라(전체/치킨/패스트푸드) 폭을 CSS만으로는 못 구하고
// 버튼의 offsetLeft/offsetWidth를 재서 옮긴다. 폰트가 늦게 로드되면
// 폭이 바뀔 수 있어 document.fonts.ready에서도 한 번 더 잰다.
function CategoryBar({ categories, active, onSelect }) {
  const btnRefs = useRef({})
  const barRef = useRef(null)
  const [rect, setRect] = useState(null)

  const measure = () => {
    const btn = btnRefs.current[active]
    // top/height도 재서 넣는다 — CSS로 고정값을 박으면 컨테이너 패딩이
    // 바뀔 때마다(예: 그라데이션 꼬리 공간) 하이라이트가 버튼과 어긋난다.
    if (btn) {
      // 하이라이트를 글자 주위 알약이 아니라 타이틀바 천장에서 내려온
      // 모양으로 그린다 — 위쪽 끝까지 얼마나 더 뻗어야 하는지(overhang)를
      // 타이틀바와의 실제 거리로 잰다. 바 높이가 바뀌어도 따라간다.
      // 판은 스크롤 래퍼 높이를 통째로 쓴다. 기준을 타이틀바가 아니라
      // 래퍼로 잡는 이유: 래퍼가 overflow-x:auto라 세로로도 잘려서,
      // 래퍼 밖으로 아무리 늘려도 그만큼은 안 보인다. 대신 래퍼 자체를
      // 바 높이만큼 늘리고 아래로 흘려보낸다(App.css .title-bar__scroll).
      const wrap = barRef.current?.closest('.title-bar__scroll')
      const wrapRect = wrap?.getBoundingClientRect()
      const myTop = barRef.current.getBoundingClientRect().top
      const overhang = wrapRect ? myTop - wrapRect.top : 0
      setRect({
        left: btn.offsetLeft, width: btn.offsetWidth,
        top: btn.offsetTop, height: btn.offsetHeight,
        overhang,
        plateHeight: wrapRect ? wrapRect.height : btn.offsetHeight,
      })
    }
  }

  // categories도 의존성에 넣는다 — 분류 기준이 바뀌면(카테고리 ↔
  // 금액대) active 값은 그대로 'all'이어도 탭 구성 자체가 바뀌므로
  // 하이라이트를 다시 재야 한다.
  useLayoutEffect(measure, [active, categories])
  useEffect(() => {
    window.addEventListener('resize', measure)
    document.fonts?.ready?.then(measure)
    return () => window.removeEventListener('resize', measure)
  }, [active, categories])

  return (
    <div className="category-bar" role="tablist" aria-label="카테고리" ref={barRef}>
      {rect && (
        <span
          className="category-bar__highlight"
          aria-hidden="true"
          style={{
            transform: `translate(${rect.left}px, ${rect.top - rect.overhang}px)`,
            width: `${rect.width}px`,
            height: `${rect.plateHeight}px`,
          }}
        />
      )}
      {categories.map((c) => (
        <button
          key={c.key}
          ref={(el) => { btnRefs.current[c.key] = el }}
          type="button"
          role="tab"
          aria-selected={active === c.key}
          className={`category-btn ${active === c.key ? 'category-btn--active' : ''}`}
          onClick={() => onSelect(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
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
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
  // 여러 개 동시 선택 가능(Set), 전부 해제하면 원래대로 전체 표시.
  const [platformFilter, setPlatformFilter] = useState(() => new Set())
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
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY < 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 앱을 고른 직후 3초만 띄우고 스스로 사라진다 — 아직 누를 수 없는
  // 안내라 계속 자리를 지키면 카드 위 방해물이 된다. 타이머는 선택이
  // 바뀔 때마다 처음부터 다시 간다(고르는 중엔 계속 보인다).
  const [showMembership, setShowMembership] = useState(false)
  useEffect(() => {
    if (platformFilter.size === 0) { setShowMembership(false); return }
    setShowMembership(true)
    const id = setTimeout(() => setShowMembership(false), 3000)
    return () => clearTimeout(id)
  }, [platformFilter])

  const isFiltered = filterKey !== 'all' || platformFilter.size > 0 || search.trim() !== ''
  const resetFilters = () => {
    setFilterKey('all')
    setPlatformFilter(new Set())
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

  useEffect(() => {
    fetchBrands().then(setBrands).catch((e) => setError(e.message))
  }, [])

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

  const handleFilterSelect = (key) => {
    setFilterKey(key)
    if (key !== filterKey) track('category_change', { category: key })
  }

  // 레이블(카테고리 탭) 영역은 좁게 줄이고 가로 스크롤로 흡수한다.
  // 마우스는 기본적으로 세로 휠만 보낸다 — PC에서 shift 없이도 휠로
  // 옆으로 넘어가게, deltaY를 scrollLeft로 돌려준다. 스크롤할 여지가
  // 없거나(다 보임) 휠 방향으로 이미 끝(처음/끝)까지 갔으면 페이지
  // 스크롤이 이어받게 preventDefault 안 함 — 안 그러면 가로 스크롤이
  // 소진된 뒤에도 배경 세로 스크롤이 안 먹는다.
  const handleLabelsWheel = (e) => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    const atStart = el.scrollLeft <= 0
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
    if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  return (
    <>
      {/* 배너가 0건이거나 호출이 실패하면 아무것도 그리지 않는다(EventBanner가
          null을 돌려준다). 카드 그리드의 "불러오기 실패"와 다르게 다룬다 —
          배너는 부가 정보라서 실패가 화면을 어지럽히면 안 된다. */}
      <EventBanner banners={banners} />
      {/* 플랫폼 배지와 카테고리 탭을 한 스크롤 영역에 같이 넣는다. main 밖에 두어 full-bleed가 100vw 트릭 없이 자연히 성립하고, sticky도 안 깨진다. */}

      <div className="title-bar">
        <div className="title-bar__inner">
          <h1 className="sr-only">오늘의할인 — 배달앱 브랜드 할인 비교</h1>

          <div className="page-head__apps" aria-label="비교 대상 배달앱">
            {PLATFORMS.map((p) => (
              <span key={p.key} className="platform-badge-wrap">
                <PlatformBadge
                  platformKey={p.key}
                  onClick={(e) => { e.stopPropagation(); togglePlatform(p.key) }}
                  active={platformFilter.size === 0 ? undefined : platformFilter.has(p.key)}
                />
                {/* hover(또는 키보드 포커스)하면 그 앱의 멤버십 안내가
                    배지 바로 아래 뜬다. 로직은 여전히 보류 상태. */}
                <div className="membership-popover" role="note">
                  <span className="membership-popover__title">{MEMBERSHIP_LABEL[p.key]}</span>
                  <span className="pill pill--pending">구현예정</span>
                </div>
              </span>
            ))}
          </div>
          {/* 카테고리 탭 — 이 영역만 가로 스크롤한다. */}
          <div className="title-bar__scroll" onWheel={handleLabelsWheel}>
            <CategoryBar categories={tabs} active={filterKey} onSelect={handleFilterSelect} />
          </div>
          {/* 옆으로 더 있다는 힌트 — 오른쪽으로 살짝 반복 이동. */}
          <svg
            className="scroll-hint-arrow"
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </div>
        {/* 검색·초기화는 바 안에서 빼내 바로 아래 여백에 띄운다.
            absolute라 카드 그리드를 밀어내지 않고, 윗줄 배지 공간을
            통째로 비워준다. */}
        <div className="title-bar__float">
          <button
            type="button"
            className={`filter-reset-btn${isFiltered ? ' filter-reset-btn--active' : ''}`}
            onClick={resetFilters}
            aria-label="필터 초기화"
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </button>
          <SearchControl value={search} onChange={setSearch} />
        </div>
        {/* 선택한 앱의 멤버십 — 타이틀바 아래 여백에 얇게 붙는다.
            absolute라 카드 그리드를 밀어내지 않고, 아직 계산 로직이
            없어 누를 수 없는 표시용이다. */}
        {showMembership && atTop && (
          <div className="membership-tags" aria-label="선택한 앱 멤버십">
            {PLATFORMS.filter((p) => platformFilter.has(p.key)).map((p) => (
              <span key={p.key} className="membership-tag" title="구현예정">
                {MEMBERSHIP_LABEL[p.key]}
              </span>
            ))}
          </div>
        )}
      </div>
    <main>

      {error && <p className="msg msg--error">불러오기 실패: {error}</p>}
      {!error && !brands && <p className="msg">불러오는 중…</p>}

      {visibleBrands && visibleBrands.length === 0 && (
        <p className="msg">
          {search.trim() ? `"${search}" 검색 결과가 없습니다.` : '이 분류엔 브랜드가 없습니다.'}
        </p>
      )}

      {visibleBrands && visibleBrands.length > 0 && (
        <div className="brand-grid">
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
    </main>
    </>
  )
}
