// 당일 행사 배너. 페이지 최상단에 있고, 스크롤해서 화면 밖으로 나가면
// 하단에 떠 있는 배너로 넘어간다. 여러 건이면 5초마다 넘어간다.
//
// 상단과 하단은 밀도만 다른 같은 컴포넌트다. 배너용 이미지를 따로 만들지
// 않고 메타데이터(금액·기간·부가정보)로 렌더하므로, 배너를 바꿀 때 프론트를
// 다시 배포할 필요가 없다 — api의 banners.yml만 고치면 된다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo, PlatformBadge, platformIconSrc, PLATFORM_BY_KEY } from './logos.jsx'
import { bannerPalette, brandSeed, platformSeed } from './brandColor.js'
import { track } from './analytics.js'

const ROTATE_MS = 5000
const DISMISS_KEY = 'dk_banner_hidden'

// 배너가 0건일 때도 훅은 같은 순서로 불려야 한다 — 그때 useSeed에 넘길 자리.
const NO_BANNER = { id: null, brand: null, color: null, platform: 'baemin' }

// 닫기는 배너별이 아니라 하루 통짜다. localStorage 기반이라 사이트 데이터를
// 지우거나 기기를 바꾸면 초기화된다 — visitCount와 같은 한계이고 배너에서는
// 문제가 되지 않는다.
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === today()
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, today())
  } catch {
    /* 사파리 프라이빗 등 — 못 적으면 그냥 이번 세션엔 안 뜬다 */
  }
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

function usePageHidden() {
  const [hidden, setHidden] = useState(() => document.hidden)
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return hidden
}

// 시드색은 yml color -> 로고 추출 -> 플랫폼 색 순으로 정해진다. 로고 추출은
// 이미지 로드가 끝나야 하므로, 먼저 플랫폼 색으로 그려두고 값이 나오면
// 갈아끼운다(브랜드당 한 번만 훑고 결과는 캐시된다).
function useSeed(banner) {
  const fallback = banner.color ?? platformSeed(banner.platform)
  const [seed, setSeed] = useState(fallback)

  useEffect(() => {
    setSeed(fallback)
    if (banner.color || !banner.brand) return
    let alive = true
    brandSeed(banner.brand).then((found) => {
      if (alive && found) setSeed(found)
    })
    return () => { alive = false }
  }, [banner.id, banner.brand, banner.color, fallback])

  return seed
}

function BannerCard({ banner, palette, position, dots, onClose }) {
  const platform = PLATFORM_BY_KEY[banner.platform]
  // 커스텀 스킴(baemin://, ddangyo:// ...)은 새 탭에서 열면 브라우저가
  // about:blank만 띄우고 인텐트를 넘기지 않는다 — 오퍼 칩과 같은 규칙이다.
  const external = banner.url.startsWith('http')

  return (
    <div className={`banner banner--${position} ${dots ? 'banner--dots' : ''}`} style={palette}>
      <a
        className="banner__link"
        href={banner.url}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        onClick={() => track('banner_click', {
          brand: banner.brand ?? 'none',
          platform: banner.platform,
          position,
        })}
      >
        <span className="banner__logo">
          {banner.brand
            ? <BrandLogo name={banner.brand} />
            : (
              <span className="brand-logo brand-logo--platform">
                <img src={platformIconSrc(banner.platform)} alt={platform?.label ?? banner.platform} />
              </span>
            )}
        </span>

        <span className="banner__amount">{banner.amount}</span>

        {/* 기간은 금액 우측 상단, 부가정보는 그 아래. extra가 없으면 줄이
            하나뿐이라 기간이 금액 옆 세로 가운데로 내려온다 — 빈 자리를
            남기지 않는다. */}
        <span className="banner__meta">
          <span className="banner__period">{banner.period}</span>
          {banner.extra && <span className="banner__extra">{banner.extra}</span>}
        </span>
      </a>

      {/* 플랫폼 배지는 오른쪽 위 모서리 밖으로 걸친다(App.css). */}
      <span className="banner__badge" aria-hidden="true">
        <PlatformBadge platformKey={banner.platform} />
      </span>

      {onClose && (
        <button type="button" className="banner__close" aria-label="배너 오늘 하루 닫기" onClick={onClose}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      )}

      {dots}
    </div>
  )
}

function Indicators({ count, index, onSelect }) {
  return (
    <div className="banner__dots">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          className={`banner__dot ${i === index ? 'banner__dot--on' : ''}`}
          aria-label={`${i + 1}번째 배너 보기`}
          aria-current={i === index}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  )
}

export default function EventBanner({ banners }) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [topVisible, setTopVisible] = useState(true)
  const [dismissed, setDismissed] = useState(readDismissed)
  const topRef = useRef(null)

  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const pageHidden = usePageHidden()

  const count = banners?.length ?? 0
  const current = count > 0 ? banners[index % count] : null
  const seed = useSeed(current ?? NO_BANNER)
  const palette = useMemo(() => bannerPalette(seed), [seed])

  // 자동 전환. 한 건이면 돌릴 것이 없고, 손이 올라가 있거나 포커스가 안에
  // 있거나 탭이 숨겨져 있으면 멈춘다. prefers-reduced-motion이면 아예 안 돈다
  // (DNT·GPC를 존중하는 이 레포 관례와 결이 맞는다).
  const paused = hovered || focused || pageHidden || reduceMotion
  useEffect(() => {
    if (count < 2 || paused) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS)
    return () => clearInterval(timer)
  }, [count, paused])

  // 상단 배너가 화면에서 벗어나면 하단으로 넘긴다. 스크롤 픽셀값이 아니라
  // 관찰로 하는 이유는 배너 높이가 내용(extra 유무, 금액 길이, 화면 폭)에
  // 따라 달라져 임계값을 고정하면 어긋나기 때문이다.
  useEffect(() => {
    const el = topRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setTopVisible(entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [count])

  if (count === 0) return null

  const hoverProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }
  const dots = count > 1
    ? <Indicators count={count} index={index % count} onSelect={setIndex} />
    : null

  return (
    <>
      <div className="banner-slot" ref={topRef} {...hoverProps}>
        {/* key를 배너 id로 두면 내용이 바뀔 때마다 요소가 새로 마운트돼
            등장 애니메이션(App.css banner-in)이 다시 걸린다. */}
        <BannerCard key={current.id} banner={current} palette={palette} position="top" dots={dots} />
      </div>

      {/* 하단 배너는 항상 DOM에 있고 보임 상태만 토글한다 — 언마운트하면
          되돌아올 때 내려가는 전환이 안 보인다. 안 보일 때는
          visibility:hidden이라 탭 순서에서도 빠진다(App.css). */}
      <div
        className={`banner-dock ${!topVisible && !dismissed ? 'banner-dock--shown' : ''}`}
        {...hoverProps}
      >
        <div className="banner-dock__inner">
          <BannerCard
            key={current.id}
            banner={current}
            palette={palette}
            position="bottom"
            dots={dots}
            onClose={() => { setDismissed(true); writeDismissed() }}
          />
        </div>
      </div>
    </>
  )
}
