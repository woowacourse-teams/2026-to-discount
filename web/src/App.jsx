import { useEffect, useMemo, useState } from 'react'
import { fetchBrands } from './api.js'

const PLATFORMS = [
  { key: 'baemin', label: '배민', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))

// 땡겨요는 브랜드별 상세 쿠폰 페이지가 앱 전용 공유링크로만 존재한다(딥링크,
// 웹으로는 빈 WebSquare 셸만 응답함 — 확인됨). 링크를 못 열어도 앱이 깔려
// 있으면 폰에서 딥링크로 그대로 넘어간다.
const DDANGYO_LINKS = {
  '설빙': 'https://fdofd.ddangyo.com/gateway4.html?EE7GifX',
  '푸라닭': 'https://fdofd.ddangyo.com/gateway4.html?c2ytzEn',
  '버거킹': 'https://fdofd.ddangyo.com/gateway4.html?vanBB85',
  '뚜레쥬르': 'https://fdofd.ddangyo.com/gateway4.html?Su5rYT4',
  '두찜': 'https://fdofd.ddangyo.com/gateway4.html?nbYJqDX',
  '네네치킨': 'https://fdofd.ddangyo.com/gateway4.html?aTPhxVy',
  '프레드피자': 'https://fdofd.ddangyo.com/gateway4.html?2EQN6qm',
  '자담치킨': 'https://fdofd.ddangyo.com/gateway4.html?vo1gL4b',
  '청년피자': 'https://fdofd.ddangyo.com/gateway4.html?1gWfr6i',
  '호식이두마리치킨': 'https://fdofd.ddangyo.com/gateway4.html?BxZMpFY',
  '멕시카나': 'https://fdofd.ddangyo.com/gateway4.html?wXJeQzu',
  'bhc': 'https://fdofd.ddangyo.com/gateway4.html?hi55GGt',
  '후라이드참잘하는집': 'https://fdofd.ddangyo.com/gateway4.html?igsyudD',
  '왓더버거': 'https://fdofd.ddangyo.com/gateway4.html?G9Z4NxO',
  '기영이숯불두마리치킨': 'https://fdofd.ddangyo.com/gateway4.html?G9QrY5J',
  '부어치킨': 'https://fdofd.ddangyo.com/gateway4.html?u5yUGTs',
  '바른치킨': 'https://fdofd.ddangyo.com/gateway4.html?1rBQNCa',
  '7번가피자': 'https://fdofd.ddangyo.com/gateway4.html?p7kqsN0',
  '훌랄라참숯바베큐치킨': 'https://fdofd.ddangyo.com/gateway4.html?hk6PXvd',
  '또봉이통닭': 'https://fdofd.ddangyo.com/gateway4.html?kdXwMdq',
  '보끔당': 'https://fdofd.ddangyo.com/gateway4.html?ZRdUPwD',
  '오븐에빠진닭': 'https://fdofd.ddangyo.com/gateway4.html?h2O9t9f',
  '꾸브라꼬숯불치킨': 'https://fdofd.ddangyo.com/gateway4.html?kTxcrof',
  '땅땅치킨': 'https://fdofd.ddangyo.com/gateway4.html?cztTiaf',
  '오븐마루치킨': 'https://fdofd.ddangyo.com/gateway4.html?EjgK6V8',
  '치킨플러스': 'https://fdofd.ddangyo.com/gateway4.html?66iY9Bs',
  '또래오래': 'https://fdofd.ddangyo.com/gateway4.html?529nm7L',
  '일미리금계찜닭': 'https://fdofd.ddangyo.com/gateway4.html?tx8BsDy',
  '해두리치킨': 'https://fdofd.ddangyo.com/gateway4.html?CwOVSYe',
  '피자헛': 'https://fdofd.ddangyo.com/gateway4.html?1qdBNdu',
  '도미노피자': 'https://fdofd.ddangyo.com/gateway4.html?LgTHHGE',
  '파파존스': 'https://fdofd.ddangyo.com/gateway4.html?MaOqpJR',
  '떡참': 'https://fdofd.ddangyo.com/gateway4.html?gXQDKHQ',
  '맘스피자': 'https://fdofd.ddangyo.com/gateway4.html?kEVWf2s',
  '아메리칸피자': 'https://fdofd.ddangyo.com/gateway4.html?L3OTWfS',
  'BBQ': 'https://fdofd.ddangyo.com/gateway4.html?Ej2faGu',
}

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

function OfferChip({ offer, brandName }) {
  const held = offer.status === 'held'
  const showRangeBadge = offer.qualifier === '최대'
  const amountText = offer.amount != null ? `${offer.amount.toLocaleString()}원` : offer.rawText
  const link = offer.platform === 'ddangyo' ? DDANGYO_LINKS[brandName] : undefined

  const content = (
    <>
      <span className="offer__amount">
        {held && showRangeBadge && <span className="offer__range-badge">최대</span>}
        {amountText}
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
        <div className="offer__chip">{content}</div>
      )}
      {offer.platform === 'ddangyo' && (
        <span className="offer__extra">지역화폐 +2,000원</span>
      )}
    </li>
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

  return (
    <article className="brand-card">
      <header className="brand-card__head">
        <BrandLogo name={brand.name} />
        <h2 className="brand-card__name">{brand.name}</h2>
      </header>
      <ul className="offer-list">
        {sortedOffers.map((o) => (
          <OfferChip key={o.platform} offer={o} brandName={brand.name} />
        ))}
      </ul>
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
            href={`/captures/${encodeURIComponent(file)}`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={`/captures/${encodeURIComponent(file)}`}
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

  useEffect(() => {
    fetchBrands().then(setBrands).catch((e) => setError(e.message))
  }, [])

  const toggleMembership = (key) =>
    setMembership((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <main>
      <header className="page-head">
        <div className="page-head__row">
          <div>
            <h1>이번주 할인 </h1>
            <p className="sub">땡겨요는 온누리/지역화폐 2,000원 할인중</p>
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

      {error && <p className="msg msg--error">불러오기 실패: {error}</p>}
      {!error && !brands && <p className="msg">불러오는 중…</p>}

      {brands && (
        <div className="brand-grid">
          {brands.map((b) => <BrandCard key={b.name} brand={b} />)}
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
