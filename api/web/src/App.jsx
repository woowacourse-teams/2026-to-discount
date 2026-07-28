import { useEffect, useMemo, useState } from 'react'
import { fetchBrands } from './api.js'

const PLATFORMS = [
  { key: 'baemin', label: '배민', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))

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

function PlatformBadge({ platformKey }) {
  const p = PLATFORM_BY_KEY[platformKey]
  return (
    <span className={`platform-badge platform-badge--${p.key}`} title={p.label}>
      <img
        src={assetSrc('/platform-icons', p.key)}
        alt=""
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

function OfferChip({ offer, expanded, onToggle }) {
  const held = offer.status === 'held'
  const showRangeBadge = offer.qualifier === '최대'
  const amountText = offer.amount != null ? `${offer.amount.toLocaleString()}원` : offer.rawText
  const source = sourceFileName(offer.screenshotPath)

  return (
    <li className={`offer ${held ? 'offer--held' : 'offer--confirmed'}`}>
      <button
        type="button"
        className="offer__chip"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="offer__amount">
          {held && showRangeBadge && <span className="offer__range-badge">최대</span>}
          {amountText}
        </span>
        <span className="offer__icon-badge">
          <PlatformBadge platformKey={offer.platform} />
        </span>
      </button>
      {expanded && (
        <p className="offer__raw">
          원문 “{offer.rawText}”
          {source && <span className="offer__source"> · 캡처 {source}</span>}
        </p>
      )}
    </li>
  )
}

// 브랜드 하나 = 한 줄(행). 로고+이름은 왼쪽에 고정, 오퍼는 금액 큰 순으로
// 오른쪽에 수평 나열(넘치면 다음 줄로 감쌈).
function BrandRow({ brand }) {
  const [openPlatform, setOpenPlatform] = useState(null)

  const sortedOffers = useMemo(
    () => [...brand.offers].sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1)),
    [brand.offers],
  )

  return (
    <article className="brand-row">
      <header className="brand-row__head">
        <BrandLogo name={brand.name} />
        <h2 className="brand-row__name">{brand.name}</h2>
      </header>
      <ul className="offer-list">
        {sortedOffers.map((o) => (
          <OfferChip
            key={o.platform}
            offer={o}
            expanded={openPlatform === o.platform}
            onToggle={() => setOpenPlatform(openPlatform === o.platform ? null : o.platform)}
          />
        ))}
      </ul>
    </article>
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
            <h1>배달앱 브랜드 할인 비교</h1>
            <p className="sub">같은 브랜드를 어느 앱에서 시키는 게 이득인지 한눈에</p>
          </div>
          <button
            type="button"
            className="membership-trigger"
            onClick={() => setDrawerOpen(true)}
          >
            멤버십·지역화폐 <span className="pill pill--pending">준비 중</span>
          </button>
        </div>
      </header>

      {error && <p className="msg msg--error">불러오기 실패: {error}</p>}
      {!error && !brands && <p className="msg">불러오는 중…</p>}

      {brands && (
        <div className="brand-list">
          {brands.map((b) => <BrandRow key={b.name} brand={b} />)}
        </div>
      )}

      <MembershipDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        selected={membership}
        onToggle={toggleMembership}
      />
    </main>
  )
}
