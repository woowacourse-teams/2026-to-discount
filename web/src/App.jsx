import { useEffect, useId, useMemo, useState } from 'react'
import { fetchBrands } from './api.js'

const PLATFORMS = [
  { key: 'baemin', label: '배민', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))

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

// 멤버십/지역화폐 반영 로직은 아직 없다. 화면만 미리 놓아두고 실제 계산은
// docs/plans/2026-07-28-membership-pricing.md 계획대로 나중에 붙인다.
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

function sourceFileName(screenshotPath) {
  if (!screenshotPath) return null
  return screenshotPath.split('/').pop()
}

// 원본은 한 장에 8MB까지 가는 스크롤 캡처라 화면에는 항상 썸네일을 쓰고,
// 눌렀을 때만 원본을 연다(scripts/make_capture_thumbs.py가 만든다).
function captureUrl(file) {
  return `/captures/${encodeURIComponent(file)}`
}
function captureThumbUrl(file) {
  return `/captures/thumbs/${encodeURIComponent(file)}`
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
  if (offer.tiers?.length > 0) return offer.tiers
  return [{ minOrder: offer.minOrderAmount, amount: offer.amount }]
}

// brandLinks는 API가 내려주는 앱별 브랜드 쿠폰 바로가기(brands.yml 출처,
// 플랫폼 키 -> 링크). 그 앱 오퍼에만 건다 — 예를 들어 땡겨요 링크를
// 배민 칩에 걸면 안 된다. 링크가 없는 칩은 상세를 여는 버튼이 된다
// (링크가 있는 칩은 링크가 우선이라 카드 헤더로 펼친다).
function OfferChip({ offer, brandLinks, detailId, open, onToggle }) {
  const held = offer.status === 'held'
  const showRangeBadge = offer.qualifier === '최대'
  const link = brandLinks?.[offer.platform]

  const content = (
    <>
      <span className="offer__amount">
        {held && showRangeBadge && <span className="offer__range-badge">최대</span>}
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
        <a className="offer__chip offer__chip--link" href={link} target="_blank" rel="noreferrer">
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
      {offer.platform === 'ddangyo' && (
        <span className="offer__extra" title="지역화폐 결제 시 +2,000원 추가 할인">지역</span>
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
      <div className="detail__head">
        <PlatformBadge platformKey={offer.platform} />
        <span className="detail__platform">{platform?.label ?? offer.platform}</span>
        <span className="detail__amount">{offerAmountText(offer)}</span>
        {offer.status === 'held' && <span className="pill pill--pending">재확인</span>}
      </div>

      <dl className="detail__rows">
        <dt>할인</dt>
        <dd>
          <ul className="detail__tiers">
            {rows.map((t, i) => (
              <li key={t.minOrder ?? i}>
                <span className="detail__tier-min">
                  {t.minOrder != null
                    ? `${won(t.minOrder)} 이상`
                    : <span className="detail__unknown">최소주문 미확인</span>}
                </span>
                <span className="detail__tier-amount">
                  {t.amount != null
                    ? won(t.amount)
                    : <span className="detail__unknown">금액 미확인</span>}
                </span>
              </li>
            ))}
          </ul>
        </dd>

        {offer.conditions && (
          <>
            <dt>조건</dt>
            <dd>{offer.conditions}</dd>
          </>
        )}

        {offer.platform === 'ddangyo' && (
          <>
            <dt>지역화폐</dt>
            <dd>결제 시 +2,000원 추가 할인</dd>
          </>
        )}

        <dt>원문</dt>
        <dd className="detail__raw">“{offer.rawText}”</dd>
      </dl>
    </div>
  )
}

// 브랜드 하나 = 카드 하나. 1행 = 로고+이름, 2행 = 앱별 금액(수평 나열).
// 카드 여러 개가 한 줄에 2~3개씩 반응형으로 놓인다(.brand-grid).
function BrandCard({ brand }) {
  // 화면에 "최대" 배지가 실제로 뜨는 오퍼(held + qualifier="최대")는 금액과
  // 무관하게 항상 뒤로 민다. qualifier만으로 묶으면 confirmed인데 qualifier가
  // "최대"로 남은 항목(예: 땡겨요 — 배지는 안 뜨지만 값은 최대군에 끼어
  // 순서가 뒤죽박죽으로 보임)이 생기므로, 실제 배지 노출 여부를 기준으로 한다.
  const sortedOffers = useMemo(
    () => [...brand.offers].sort((a, b) => {
      const aMax = a.status === 'held' && a.qualifier === '최대' ? 1 : 0
      const bMax = b.status === 'held' && b.qualifier === '최대' ? 1 : 0
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

  // 최소주문금액은 앱 목록 화면에 안 뜨고 쿠폰 상세를 열어야 보이는 값이라
  // 아직 대부분 비어 있다. 카드마다 반복하지 않고 안내는 한 번만 붙인다.
  const anyUnknown = brand.offers.some((o) => !(o.tiers?.length) && o.minOrderAmount == null)

  return (
    <article className={`brand-card ${open ? 'brand-card--open' : ''}`}>
      <button
        type="button"
        className="brand-card__head"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setPinned((v) => !v)}
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
            detailId={detailId}
            open={open}
            onToggle={() => setPinned((v) => !v)}
          />
        ))}
      </ul>

      {/* 상세는 펼쳤을 때만 그린다. 캡처 원본이 스크린샷 한 장에 1MB가 넘어,
          브랜드 73개 × 앱 4개어치를 미리 심어두면 첫 화면이 통째로 멎는다.
          컨테이너는 aria-controls 대상이라 접혀 있어도 남겨둔다. */}
      <div id={detailId} className="brand-detail" hidden={!open}>
        {open && (
          <>
            {sortedOffers.map((o) => <OfferDetail key={o.platform} offer={o} />)}
            {anyUnknown && (
              <p className="brand-detail__note">
                최소주문금액·구간 할인은 앱에서 쿠폰 상세를 열어야 보이는 값이라 아직 수집 전입니다.
                채워지는 대로 여기에 그대로 표시됩니다.
              </p>
            )}
          </>
        )}
      </div>
    </article>
  )
}

// 판독에 실제로 쓰인 원본 캡처 전부. brands 응답의 각 offer가 이미
// screenshotPath를 들고 있어(Offer.screenshotPath) 별도 API 없이
// 여기서 중복만 제거해 모은다. 실제 파일은 web/public/captures/에
// 파일명만 그대로 복사해둔 것(export_data.py가 아는 경로는 tracker
// 레포 기준이라 API 레포에선 그대로 못 씀).
function collectCaptures(brands) {
  const seen = new Map()
  for (const brand of brands) {
    for (const offer of brand.offers) {
      const file = sourceFileName(offer.screenshotPath)
      if (file && !seen.has(file)) seen.set(file, offer.platform)
    }
  }
  return [...seen.entries()].map(([file, platform]) => ({ file, platform }))
    .sort((a, b) => a.file.localeCompare(b.file))
}

function CaptureGallery({ brands }) {
  const captures = useMemo(() => collectCaptures(brands), [brands])
  if (captures.length === 0) return null

  return (
    <section className="captures" aria-labelledby="captures-heading">
      <h2 id="captures-heading" className="captures__title">원본 캡처</h2>
      <p className="captures__note">
        위 금액을 읽은 실제 화면입니다. 판독이 의심스러우면 여기서 원본을 직접 확인하세요.
      </p>
      <div className="captures__grid">
        {captures.map(({ file, platform }) => (
          <a
            key={file}
            className="captures__item"
            href={captureUrl(file)}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={captureThumbUrl(file)}
              alt={`${PLATFORM_BY_KEY[platform]?.label ?? platform} 캡처: ${file}`}
              loading="lazy"
            />
            <span className="captures__caption">{file}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

function MembershipDrawer({ open, onClose, selected, onToggle }) {
  return (
    <>
      <div
        className={`drawer-backdrop ${open ? 'drawer-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`drawer ${open ? 'drawer--open' : ''}`}
        aria-labelledby="membership-heading"
        aria-hidden={!open}
      >
        <div className="drawer__head">
          <h2 id="membership-heading" className="drawer__title">멤버십·지역화폐 반영</h2>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <span className="pill pill--pending">준비 중</span>
        <p className="drawer__note">
          체크해두면 이후 각 앱의 멤버십·지역화폐 혜택까지 반영한 실질 금액을 보여줄 예정입니다.
          지금은 화면만 먼저 놓아둔 상태라 선택해도 금액은 바뀌지 않습니다.
        </p>
        <div className="drawer__options">
          {MEMBERSHIP_OPTIONS.map((m) => (
            <label key={m.key} className="drawer__option">
              <input
                type="checkbox"
                checked={!!selected[m.key]}
                onChange={() => onToggle(m.key)}
              />
              {m.label}
            </label>
          ))}
        </div>
      </aside>
    </>
  )
}

export default function App() {
  const [brands, setBrands] = useState(null)
  const [error, setError] = useState(null)
  const [membership, setMembership] = useState({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [category, setCategory] = useState('all')

  useEffect(() => {
    fetchBrands().then(setBrands).catch((e) => setError(e.message))
  }, [])

  const toggleMembership = (key) =>
    setMembership((prev) => ({ ...prev, [key]: !prev[key] }))

  // category는 API가 brands.yml에서 읽어 내려준다. 분류가 없는 브랜드는
  // null이라 "전체"에서만 보인다.
  const visibleBrands = useMemo(() => {
    if (!brands || category === 'all') return brands
    return brands.filter((b) => b.category === category)
  }, [brands, category])

  return (
    <main>
      <header className="page-head">
        <div className="page-head__row">
          <div>
            <div className="page-head__title-row">
              <h1>이번주 할인</h1>
              <div className="page-head__apps" aria-label="비교 대상 배달앱">
                {PLATFORMS.map((p) => <PlatformBadge key={p.key} platformKey={p.key} />)}
              </div>
            </div>
            <p className="sub">
              <span className="sub__highlight">지역화폐</span> 땡겨요 결제 시 +2,000원 추가 할인
            </p>
          </div>
          <button
            type="button"
            className="membership-trigger"
            onClick={() => setDrawerOpen(true)}
          >
            멤버십(배클/와우/패스) <span className="pill pill--pending">적용</span>
          </button>
        </div>
      </header>

      <div className="category-bar" role="tablist" aria-label="카테고리">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={category === c.key}
            className={`category-btn ${category === c.key ? 'category-btn--active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className="msg msg--error">불러오기 실패: {error}</p>}
      {!error && !brands && <p className="msg">불러오는 중…</p>}

      {visibleBrands && visibleBrands.length === 0 && (
        <p className="msg">이 카테고리엔 브랜드가 없습니다.</p>
      )}

      {visibleBrands && visibleBrands.length > 0 && (
        <div className="brand-grid">
          {visibleBrands.map((b) => <BrandCard key={b.name} brand={b} />)}
        </div>
      )}

      {brands && <CaptureGallery brands={brands} />}

      <MembershipDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selected={membership}
        onToggle={toggleMembership}
      />
    </main>
  )
}
