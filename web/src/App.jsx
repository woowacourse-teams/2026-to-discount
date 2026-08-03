import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { fetchBrands } from './api.js'
import { track } from './analytics.js'

const PLATFORMS = [
  { key: 'baemin', label: '배민', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))

// 쿠팡이츠·요기요는 brands.yml에 브랜드별 딥링크가 없다(공유 기능 자체가
// 없어서 못 만듦). 앱 공유 기능으로 받은 링크로 앱을 연다. 브랜드별 진짜
// 딥링크는 나중에 별도로 찾는다.
//
// coupangeats 링크는 ADB(dumpsys activity top)로 실기 WebView의
// webview.encodeurl을 그대로 뽑은 와우컬렉션(와우 라운지) 진입 URL이다
// (2026-08-03). key에 날짜(0803)가 박혀 있어 로테이트되는 프로모션
// 링크로 보인다 — 날짜 지나면 깨질 수 있으니 주기적으로 같은 방법으로
// 재확인·교체해야 한다. 날짜 없는 고정 진입점은 아직 못 찾음.
const PLATFORM_APP_LINKS = {
  coupangeats: 'https://eats-mobile-web.coupang.com/promotion/landing-page-v5?key=V5_WOW_LOUNGE_0803_AC',
  yogiyo: 'https://url.customer.yogiyo.co.kr/MUVJRHpYU2',
}

// 필터 탭 목록. key는 API가 내려주는 brand.category 값과 맞춰야 한다
// (실제 브랜드별 분류는 API 쪽 brands.yml이 단일 출처다).
const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'chicken', label: '치킨' },
  { key: 'pizza', label: '피자' },
  { key: 'fastfood', label: '패스트푸드' },
  { key: 'cafe', label: '카페' },
  { key: 'convenience', label: '편의점' },
]

// 카테고리 탭을 무엇 기준으로 나눌지. 'discount'/'minOrder'는 브랜드
// 대표 금액을 천원 단위로 묶어 탭을 그때그때 만든다(아래 amountBand*).
const CLASSIFY_MODES = [
  { key: 'category', label: '카테고리' },
  { key: 'discount', label: '할인금액대' },
  { key: 'minOrder', label: '최소주문금액대' },
]

// 금액을 천원 단위로 묶는다(500원 단위 값도 내림해서 같은 구간에 넣는다).
// 1만원 이상은 "n만m천원대"로 표기.
function amountBandKey(amount) {
  return Math.floor(amount / 1000)
}
function amountBandLabel(bandKey) {
  const man = Math.floor(bandKey / 10)
  const cheon = bandKey % 10
  if (man > 0) return `${man}만${cheon > 0 ? `${cheon}천` : ''}원대`
  return `${bandKey}천원대`
}

// 브랜드의 대표 금액. discount는 API가 이미 계산해 내려주는
// maxConfirmedAmount, minOrder는 오퍼들 중 알려진 값의 최솟값(가장 싸게
// 들어가는 조건) — 하나도 모르면 null(미확인은 모든 금액대 탭에 걸치게
// 아래 필터에서 처리).
function brandAmountFor(mode, brand) {
  if (mode === 'discount') return brand.maxConfirmedAmount ?? null
  const known = brand.offers.map((o) => o.minOrderAmount).filter((v) => v != null)
  return known.length ? Math.min(...known) : null
}

// 멤버십/지역화폐 반영 로직은 아직 없다. delivery-discount-api 레포의
// docs/specs/2026-07-28-product-brief.md에 "UI만 배치, 로직 보류"로 명시된
// 의도적 보류 상태 — 계산 모델이 나오면 그 레포 docs/plans에 계획이 생긴다.
const MEMBERSHIP_OPTIONS = [
  { key: 'baemin', label: '배민클럽' },
  { key: 'coupangeats', label: '쿠팡 와우' },
  { key: 'yogiyo', label: '요기패스' },
  { key: 'ddangyo', label: '지역화폐' },
]

function assetSrc(base, name) {
  return `${base}/${encodeURIComponent(name)}.png`
}

function won(value) {
  return `${value.toLocaleString()}원`
}

// 브랜드 카드 딥링크용 id. 브랜드명 자체가 이미 유니크한 키라 그대로
// 쓰되, 공백만 앵커에서 다루기 까다로우니 치환한다.
function brandCardId(name) {
  return `brand-${name.trim().replace(/\s+/g, '_')}`
}

// 폴백 글자(span)는 position:absolute라 static인 img보다 항상 위에 그려진다
// (DOM 순서와 무관하게 positioned 요소가 위로 쌓임). onError로 깨진 이미지만
// 숨기던 이전 방식은 "로드는 됐지만 저해상도라 흐릿한" 로고 위에 글자가 겹쳐
// 보이는 문제가 있었다(예: 또래오래, 파파존스). 로드 성공 시 폴백을 직접
// 숨겨서 이미지·글자 중 하나만 보이게 한다.
function hideSiblingFallback(e) {
  const fallback = e.currentTarget.nextElementSibling
  if (fallback) fallback.style.display = 'none'
}

function PlatformBadge({ platformKey }) {
  const p = PLATFORM_BY_KEY[platformKey]
  return (
    <span className={`platform-badge platform-badge--${p.key}`} title={p.label}>
      <img
        src={assetSrc('/platform-icons', p.key)}
        alt=""
        onLoad={hideSiblingFallback}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <span className="platform-badge__fallback" aria-hidden="true">{p.initial}</span>
      <span className="sr-only">{p.label}</span>
    </span>
  )
}

function BrandLogo({ name }) {
  return (
    <span className="brand-logo">
      <img
        src={assetSrc('/logos', name)}
        alt={name}
        onLoad={hideSiblingFallback}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <span className="brand-logo__fallback" aria-hidden="true">{name.trim().charAt(0)}</span>
    </span>
  )
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
  const showRangeBadge = offer.qualifier === '최대'
  const link = brandLinks?.[offer.platform] ?? PLATFORM_APP_LINKS[offer.platform]

  const content = (
    <>
      <span className="offer__amount">
        {showRangeBadge && <span className="offer__range-badge">최대</span>}
        {offerAmountText(offer)}
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
          target="_blank"
          rel="noreferrer"
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
                  {t.amount != null
                    ? won(t.amount)
                    : <span className="detail__unknown">금액 미확인</span>}
                </span>
                <span className="detail__tier-min">
                  {t.minOrder != null
                    ? `${won(t.minOrder)} 이상 주문 시`
                    : <span className="detail__unknown">최소주문 미확인</span>}
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
  // 화면에 "최대" 배지가 뜨는 오퍼(qualifier="최대")는 금액과 무관하게
  // 항상 뒤로 민다 — confirmed든 held든, "최대"는 실제 최소주문금액을
  // 채워야 진짜 값이 나오는 상한액이라 액면 그대로 비교하면 왜곡된다.
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
function CategoryBar({ categories, active, onSelect, onWheel }) {
  const btnRefs = useRef({})
  const [rect, setRect] = useState(null)

  const measure = () => {
    const btn = btnRefs.current[active]
    // top/height도 재서 넣는다 — CSS로 고정값을 박으면 컨테이너 패딩이
    // 바뀔 때마다(예: 그라데이션 꼬리 공간) 하이라이트가 버튼과 어긋난다.
    if (btn) {
      setRect({
        left: btn.offsetLeft, width: btn.offsetWidth,
        top: btn.offsetTop, height: btn.offsetHeight,
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
    <div className="category-bar" role="tablist" aria-label="카테고리" onWheel={onWheel}>
      {rect && (
        <span
          className="category-bar__highlight"
          aria-hidden="true"
          style={{
            transform: `translate(${rect.left}px, ${rect.top}px)`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
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

// 금액대 분류일 때 탭 대신 쓰는 스텝 슬라이더 — 이퀄라이저처럼 정해진
// 값에서만 멈춘다(연속값 아님). 현재 값은 캡션으로 항상 슬라이더 위에
// 띄운다. bands[0]은 항상 "전체".
function AmountBandSlider({ mode, bands, active, onSelect }) {
  const index = Math.max(0, bands.findIndex((b) => b.key === active))
  const percent = bands.length > 1 ? (index / (bands.length - 1)) * 100 : 0
  const modeLabel = CLASSIFY_MODES.find((m) => m.key === mode)?.label

  return (
    <div className="amount-slider">
      {/* 슬라이더만 보면 지금 금액이 "할인금액"인지 "최소주문금액"인지
          안 보인다 — 위에 기준 이름을 고정으로 띄운다. */}
      <div className="amount-slider__mode">{modeLabel}</div>
      <div className="amount-slider__track-wrap">
        <span className="amount-slider__caption" style={{ left: `${percent}%` }}>
          {bands[index]?.label}
        </span>
        <input
          type="range"
          className="amount-slider__input"
          min={0}
          max={Math.max(0, bands.length - 1)}
          step={1}
          value={index}
          onChange={(e) => onSelect(bands[Number(e.target.value)].key)}
          aria-label={`${modeLabel} 선택`}
        />
        <div className="amount-slider__ticks" aria-hidden="true">
          {bands.map((b) => <span key={b.key} className="amount-slider__tick" />)}
        </div>
      </div>
      {/* 전체 구간이 어디서 어디까지인지 양 끝 값만 보여준다 — 눈금마다
          다 적으면 좁은 화면에서 겹친다. */}
      {bands.length > 1 && (
        <div className="amount-slider__range" aria-hidden="true">
          <span>{bands[1]?.label}</span>
          <span>{bands[bands.length - 1]?.label}</span>
        </div>
      )}
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

// 카테고리 탭 왼쪽의 회색 화살표. 눌러서 분류 기준(카테고리/할인금액대/
// 최소주문금액대)을 고르는 작은 드롭다운.
function ClassifyPicker({ mode, onSelect }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="classify-picker">
      {open && <div className="dropdown-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <button
        type="button"
        className="classify-picker__btn"
        aria-expanded={open}
        aria-label="분류 기준 선택"
        onClick={() => setOpen((v) => !v)}
      >
        ▾
      </button>
      <div
        className={`dropdown classify-picker__menu ${open ? 'dropdown--open' : ''}`}
        role="menu"
        aria-label="분류 기준"
        aria-hidden={!open}
      >
        {CLASSIFY_MODES.map((m) => {
          // 할인금액대/최소주문금액대는 당장 비활성화 — 카테고리만 고를 수 있다.
          const disabled = m.key !== 'category'
          const btn = (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={mode === m.key}
              disabled={disabled}
              className={`classify-picker__option ${mode === m.key ? 'classify-picker__option--active' : ''}`}
              onClick={() => { onSelect(m.key); setOpen(false) }}
            >
              {m.label}
            </button>
          )
          return disabled
            ? <div key={m.key} className="wip" data-wip-tip="작업중입니다!">{btn}</div>
            : <div key={m.key}>{btn}</div>
        })}
      </div>
    </div>
  )
}

// 화면 왼쪽 위에 항상 떠 있는 안내 버튼. hover(마우스)로 열고 벗어나면
// 닫힌다. 클릭(터치, hover가 없는 환경)은 열기 전용 — 클릭을 열림/닫힘
// 토글로 두면, 실제 마우스 클릭은 버튼에 커서가 "닿는" mouseenter가
// click보다 먼저 발생해 이미 open=true인 상태에서 click이 도착한다.
// 토글이면 그 click이 방금 hover가 연 것을 즉시 다시 닫아 버려, 클릭해도
// 안 열리는 것처럼 보였다(실기 확인). 닫기는 backdrop(바깥) 클릭·hover만
// 담당한다.
function InfoTip() {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="info-fab"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open && (
        <div
          className="dropdown-backdrop"
          onClick={() => setOpen(false)}
          onMouseEnter={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        className="info-fab__btn"
        aria-expanded={open}
        aria-label="위치 안내"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      <div className={`info-fab__tip ${open ? 'info-fab__tip--open' : ''}`} role="tooltip">
        ! 주변 가게만 보이진 않습니다.
        <br />
        ! 미확인 정보들은 지속 업데이트됩니다.
          <br />
          쿠팡/요기요는 앱이 열리고
          <br />
          배민/땡겨요는 해당 브랜드로 연결됩니다.
      </div>
    </div>
  )
}

// 화면 오른쪽에서 밀려나오는 드로어 대신, 버튼 바로 아래 뜨는 드롭다운.
// 버튼(.membership-trigger)과 이 메뉴는 부모 .membership(position:relative)
// 하나를 공유해야 top:100%가 버튼 기준으로 맞는다.
function MembershipMenu({ open, onClose, selected, onToggle }) {
  return (
    <>
      {/* 눈에 안 보이는 전체 화면 클릭 캐처 — 메뉴 밖을 누르면 닫힌다.
          열렸을 때만 렌더해서 평소엔 이 레이어가 아예 없다. */}
      {open && <div className="dropdown-backdrop" onClick={onClose} aria-hidden="true" />}
      <div
        className={`dropdown ${open ? 'dropdown--open' : ''}`}
        role="menu"
        aria-label="멤버십·지역화폐 반영"
        aria-hidden={!open}
      >
        <div className="dropdown__head">
          <span className="dropdown__title">멤버십·지역화폐 반영</span>
          <span className="pill pill--pending">준비 중</span>
        </div>
        <p className="dropdown__note">
          체크해두면 이후 각 앱의 멤버십·지역화폐 혜택까지 반영한 실질 금액을 보여줄 예정입니다.
          지금은 화면만 먼저 놓아둔 상태라 선택해도 금액은 바뀌지 않습니다.
        </p>
        <div className="dropdown__options">
          {MEMBERSHIP_OPTIONS.map((m) => (
            <div key={m.key} className="wip" data-wip-tip="작업중입니다!">
              <label className="dropdown__option dropdown__option--disabled">
                <input
                  type="checkbox"
                  checked={!!selected[m.key]}
                  onChange={() => onToggle(m.key)}
                  disabled
                />
                {m.label}
              </label>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export default function App() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(null)
  const [membership, setMembership] = useState({})
  const [menuOpen, setMenuOpen] = useState(false)
  const [classifyBy, setClassifyBy] = useState('category')
  const [filterKey, setFilterKey] = useState('all')
  const [search, setSearch] = useState('')

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

  const toggleMembership = (key) =>
    setMembership((prev) => ({ ...prev, [key]: !prev[key] }))

  // 분류 기준이 바뀔 때마다(예: 카테고리 → 할인금액대) 탭을 새로 만든다.
  // 금액대 탭은 실제 데이터에 나오는 금액만큼만 생긴다.
  const tabs = useMemo(() => {
    if (!brands || classifyBy === 'category') return CATEGORIES
    const keys = new Set()
    brands.forEach((b) => {
      const amount = brandAmountFor(classifyBy, b)
      if (amount != null) keys.add(amountBandKey(amount))
    })
    return [
      { key: 'all', label: '전체' },
      ...[...keys].sort((a, b) => a - b).map((k) => ({ key: String(k), label: amountBandLabel(k) })),
    ]
  }, [brands, classifyBy])

  // category는 API가 brands.yml에서 읽어 내려준다. 분류가 없는 브랜드는
  // null이라 "전체"에서만 보인다. 금액대 분류에서 값을 모르는 브랜드는
  // 어느 탭에서도 안 숨긴다 — 최소주문금액이 대부분 미수집이라 "미확인"
  // 탭 하나로 몰면 사실상 안 보이는 것과 같기 때문. 검색은 항상 같이
  // 적용된다.
  const visibleBrands = useMemo(() => {
    if (!brands) return brands
    const q = search.trim()
    return brands.filter((b) => {
      const inSearch = q === '' || b.name.includes(q)
      if (!inSearch) return false
      if (filterKey === 'all') return true
      if (classifyBy === 'category') return b.category === filterKey
      const amount = brandAmountFor(classifyBy, b)
      return amount == null || String(amountBandKey(amount)) === filterKey
    })
  }, [brands, classifyBy, filterKey, search])

  const handleFilterSelect = (key) => {
    setFilterKey(key)
    if (key !== filterKey) track('category_change', { category: key, mode: classifyBy })
  }

  // 레이블(카테고리 탭) 영역은 좁게 줄이고 가로 스크롤로 흡수한다.
  // 마우스는 기본적으로 세로 휠만 보낸다 — PC에서 shift 없이도 휠로
  // 옆으로 넘어가게, deltaY를 scrollLeft로 돌려준다. 이미 다 보여서
  // 스크롤할 게 없으면 페이지 스크롤 그대로 두게 preventDefault 안 함.
  // CategoryBar 자체(스크롤 컨테이너)에 붙는다 — 감싸는 바깥 div에
  // 붙이면 화살표 버튼까지 같이 밀려나 버린다.
  const handleLabelsWheel = (e) => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }

  return (
    <main>
      <div className="update-notice" role="status">주간 데이터 업데이트 중입니다. 잠시만 기다려주세요.</div>
      <header className="page-head">
        <div className="page-head__row">
          <div className="page-head__banner">
            <h1 className="page-head__logo">
              <img src="/main_logo.png" alt="오늘의할인" />
            </h1>
            <div className="page-head__apps" aria-label="비교 대상 배달앱">
              {PLATFORMS.map((p) => <PlatformBadge key={p.key} platformKey={p.key} />)}
            </div>
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar__labels">
          <ClassifyPicker
            mode={classifyBy}
            onSelect={(mode) => {
              if (mode === classifyBy) return
              setClassifyBy(mode)
              setFilterKey('all')
              track('classify_change', { mode })
            }}
          />
          <InfoTip />
          {classifyBy === 'category' ? (
            <CategoryBar categories={tabs} active={filterKey} onSelect={handleFilterSelect} onWheel={handleLabelsWheel} />
          ) : (
            <AmountBandSlider mode={classifyBy} bands={tabs} active={filterKey} onSelect={handleFilterSelect} />
          )}
          <SearchControl value={search} onChange={setSearch} />
        </div>
      </div>

      <div className="membership-row">
        <div className="membership">
          <button
            type="button"
            className="membership-trigger"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => {
              if (!v) track('membership_open')
              return !v
            })}
          >
            멤버십(배클/와우/패스) <span className="pill pill--pending">적용</span>
          </button>
          <MembershipMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            selected={membership}
            onToggle={toggleMembership}
          />
        </div>
      </div>

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
  )
}
