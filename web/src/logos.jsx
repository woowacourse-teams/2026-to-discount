// 브랜드·플랫폼 로고 조각. App.jsx에서 끌어냈다.
//
// 배너(EventBanner.jsx)가 이 둘을 그대로 재사용하는데, EventBanner가
// App.jsx에서 import하면 App이 다시 EventBanner를 import해 순환이 된다.
// 공용 모듈로 빼서 양쪽이 여기서 가져다 쓴다.

export const PLATFORMS = [
  { key: 'baemin', label: '배민', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
export const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))

function assetSrc(base, name) {
  return `${base}/${encodeURIComponent(name)}.png`
}

// 로고 파일명 규칙. 색 추출(brandColor.js)도 같은 파일을 읽어야 하므로
// 컴포넌트 안에 두지 않고 따로 뺀다.
export function brandLogoSrc(name) {
  const fileName = name
    .replace(/[^a-zA-Z0-9가-힣]+/g, '_')
    .replace(/^_|_$/g, '')
  return assetSrc('/logos', fileName)
}

export function platformIconSrc(platformKey) {
  return assetSrc('/platform-icons', platformKey)
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

// onClick이 있으면 버튼(플랫폼 필터 토글 등)으로, 없으면 예전처럼 순수
// 장식용 span으로 렌더한다 — 오퍼 칩·배너처럼 클릭 의미가 없는 자리에서는
// 여전히 span이라 키보드 포커스를 쓸데없이 늘리지 않는다.
export function PlatformBadge({ platformKey, onClick, active }) {
  const p = PLATFORM_BY_KEY[platformKey]
  const content = (
    <>
      <img
        src={platformIconSrc(p.key)}
        alt=""
        onLoad={hideSiblingFallback}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <span className="platform-badge__fallback" aria-hidden="true">{p.initial}</span>
      <span className="sr-only">{p.label}</span>
    </>
  )
  const className = `platform-badge platform-badge--${p.key}${active === false ? ' platform-badge--dim' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} title={p.label} aria-pressed={active === true} onClick={onClick}>
        {content}
      </button>
    )
  }
  return (
    <span className={className} title={p.label}>
      {content}
    </span>
  )
}

export function BrandLogo({ name }) {
  return (
    <span className="brand-logo">
      <img
        src={brandLogoSrc(name)}
        alt={name}
        onLoad={hideSiblingFallback}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
      <span className="brand-logo__fallback" aria-hidden="true">{name.trim().charAt(0)}</span>
    </span>
  )
}
