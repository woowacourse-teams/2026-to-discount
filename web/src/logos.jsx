import { assetSrc, brandLogoSrc } from './logoSrc.js'
import { PLATFORM_ICON_DATA } from './platformIcons.js'

// 브랜드·플랫폼 로고 조각. App.jsx에서 끌어냈다.
//
// 배너(EventBanner.jsx)가 이 둘을 그대로 재사용하는데, EventBanner가
// App.jsx에서 import하면 App이 다시 EventBanner를 import해 순환이 된다.
// 공용 모듈로 빼서 양쪽이 여기서 가져다 쓴다.

// 플랫폼 목록은 platforms.js(순수 모듈)에 있다 — filters.js의 node --test가 .jsx를 못 읽는다.
import { PLATFORMS, PLATFORM_BY_KEY, iconFor } from './platforms.js'
export { PLATFORMS, PLATFORM_BY_KEY }

// 주소 계산은 logoSrc.js에 있다 — node --test가 .jsx를 못 읽어서
// 순수 함수를 컴포넌트와 같은 파일에 두면 테스트를 못 붙인다.

// 아이콘 넷은 카드마다 붙어 방문당 4번의 요청이 됐다. 번들에 박으면
// 요청이 0이 된다 — Edge Requests는 바이트가 아니라 **요청 수**로 세기
// 때문에, 작은 자산일수록 파일로 두는 값이 비싸다(2026-09-07 한도 경고).
// 넷을 합쳐 13KB다(WebP+base64). 파일이 없으면 예전 경로로 떨어진다.
export function platformIconSrc(platformKey) {
  return PLATFORM_ICON_DATA[platformKey] || assetSrc('/platform-icons', platformKey)
}

// 화면에 45px로 그리는 자리다(.brand-logo). 목록이 길어 대부분의 카드는
// 스크롤 전까지 안 보이는데, 예전에는 전부 즉시 받아 왔다 — 카드가 늘수록
// 첫 화면과 무관한 이미지가 그만큼 따라온다.
//
// width/height를 적어 두는 건 지연 로딩과 한 쌍이다. 크기를 모르면 브라우저가
// 자리를 못 잡아, 이미지가 뜰 때마다 아래 내용이 밀린다.
const LOGO_PX = 45

// 폴백 글자(span)는 position:absolute라 static인 img보다 항상 위에 그려진다
// (DOM 순서와 무관하게 positioned 요소가 위로 쌓임). onError로 깨진 이미지만
// 숨기던 이전 방식은 "로드는 됐지만 저해상도라 흐릿한" 로고 위에 글자가 겹쳐
// 보이는 문제가 있었다(예: 또래오래, 파파존스). 로드 성공 시 폴백을 직접
// 숨겨서 이미지·글자 중 하나만 보이게 한다.
function hideFallbackOf(img) {
  const fallback = img.nextElementSibling
  if (fallback) fallback.style.display = 'none'
}

function hideSiblingFallback(e) {
  hideFallbackOf(e.currentTarget)
}

// 깨졌을 때만 글자를 보인다. 글자는 처음부터 숨겨 둔다 — 로드될 때마다 글자가 먼저 비쳤다가 로고로
// 바뀌는 깜빡임이 거슬렸다(2026-10-01 사용자). 로고 파일이 아예 없는 브랜드는 img가 없어 글자가 그대로 보인다.
function hideBroken(e) {
  const img = e.currentTarget
  img.style.display = 'none'
  const fallback = img.nextElementSibling
  if (fallback) fallback.style.display = ''
}

// 서버가 그린 HTML(SSR)에서는 React가 붙기 전에 이미지 로드가 끝난다. 그러면 onLoad·onError가
// 이미 지나가 폴백 글자가 로고 위에 그대로 남는다(2026-10-01 SSR 도입 뒤). 붙는 순간(ref) 이미
// 끝난 로드를 직접 보고 같은 처리를 한다. 아직 로딩 중이면 onLoad·onError가 맡는다.
// 깨짐 판정(complete인데 naturalWidth 0)은 여기서 하지 않는다 — 지연 로딩(loading=lazy) 이미지는 아직 안 받은
// 상태에서도 complete가 참으로 읽히는 브라우저가 있어, 멀쩡한 로고를 영영 숨길 수 있다.
function settleIfLoaded(img) {
  if (img && img.complete && img.naturalWidth > 0) hideFallbackOf(img)
}

// onClick이 있으면 버튼(플랫폼 필터 토글 등)으로, 없으면 예전처럼 순수
// 장식용 span으로 렌더한다 — 오퍼 칩·배너처럼 클릭 의미가 없는 자리에서는
// 여전히 span이라 키보드 포커스를 쓸데없이 늘리지 않는다.
export function PlatformBadge({ platformKey, via = null, brand = null, onClick, active }) {
  const p = iconFor(platformKey, via)
  // 아이콘이 없는 자리(자사 행사)는 브랜드 로고를 그대로 쓴다. 로고도 없으면 아무것도
  // 안 그린다 — 여기서 죽으면 카드 하나가 아니라 페이지 전체가 안 그려진다.
  if (!p) return brand ? <BrandLogo name={brand} /> : null
  const content = (
    <>
      <img
        src={platformIconSrc(p.key)}
        alt=""
        loading="lazy"
        decoding="async"
        width={LOGO_PX}
        height={LOGO_PX}
        ref={settleIfLoaded}
        onLoad={hideSiblingFallback}
        onError={hideBroken}
      />
      <span className="platform-badge__fallback" aria-hidden="true" style={{ display: 'none' }}>{p.initial}</span>
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
  const src = brandLogoSrc(name)
  return (
    <span className="brand-logo">
      {/* 파일이 없으면 img를 아예 그리지 않는다. src=null인 img를 두면
          브라우저가 현재 주소를 다시 받아 오는 등 엉뚱한 요청이 나가고,
          로고 없는 브랜드마다 그 요청이 붙는다. */}
      {src && (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          width={LOGO_PX}
          height={LOGO_PX}
          ref={settleIfLoaded}
          onLoad={hideSiblingFallback}
          onError={hideBroken}
        />
      )}
      <span className="brand-logo__fallback" aria-hidden="true" style={src ? { display: 'none' } : undefined}>{name.trim().charAt(0)}</span>
    </span>
  )
}
