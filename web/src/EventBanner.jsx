// 당일 행사 배너. 페이지 최상단에 있고, 스크롤해서 화면 밖으로 나가면
// 하단에 떠 있는 배너로 넘어간다. 여러 건이면 5초마다 넘어간다.
//
// 상단과 하단은 밀도만 다른 같은 컴포넌트다. 배너용 이미지를 따로 만들지
// 않고 메타데이터(금액·기간·부가정보)로 렌더하므로, 배너를 바꿀 때 프론트를
// 다시 배포할 필요가 없다 — api의 banners.yml만 고치면 된다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandLogo, platformIconSrc, PLATFORM_BY_KEY } from './logos.jsx'
import { bannerPalette, brandSeed, platformSeed } from './brandColor.js'
import { track } from './analytics.js'
import { indexToSlot, settleSlot, slotToIndex, withSentinels } from './bannerScroll.js'

// 넘어가는 간격. 4.3초에서 1초 늘렸다(사용자 결정 2026-09-16).
const ROTATE_MS = 5300
// 한 칸 미끄러지는 시간. 브라우저 smooth 스크롤(~300ms)보다 0.5초 느리게.
const SLIDE_MS = 800
// 장 사이 간격(App.css .banner-track gap과 같은 값).
const SLIDE_GAP = 12
const DISMISS_KEY = 'dk_banner_hidden'


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

function BannerCard({ banner, position, onClose, onSeen }) {
  // 색은 카드가 직접 뽑는다. 여러 장이 한 줄에 나란히 놓이면서 배너마다
  // 색이 달라졌다 — 바깥에서 하나만 계산해 내리면 전부 같은 색이 된다.
  const seed = useSeed(banner)
  const palette = useMemo(() => bannerPalette(seed), [seed])
  const platform = PLATFORM_BY_KEY[banner.platform]
  const cardRef = useRef(null)

  // 클릭 수만으로는 배너가 잘 먹히는지 알 수 없다 — 안 눌린 게 안 보여서인지
  // 보고도 안 눌러서인지 구분이 안 된다. 실제로 화면에 들어온 장만 세서
  // 분모를 만든다. 캐러셀에서 옆 장은 track의 overflow에 잘려 있어 여기
  // 걸리지 않는다(교차 영역은 조상 클리핑까지 반영된다).
  // 콜백은 부르는 쪽에서 매 렌더 새로 만들어진다 — 의존성에 그대로 두면
  // 렌더마다 관찰자를 새로 달았다 뗀다. 최신 것만 붙들어 둔다.
  const seenRef = useRef(onSeen)
  seenRef.current = onSeen

  useEffect(() => {
    const el = cardRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => {
      // 절반은 보여야 봤다고 친다. 스쳐 지나간 것까지 세면 분모가 부풀어
      // 클릭률이 실제보다 낮게 나온다.
      if (entry.isIntersecting) seenRef.current?.()
    }, { threshold: .5 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  // 커스텀 스킴(baemin://, ddangyo:// ...)은 새 탭에서 열면 브라우저가
  // about:blank만 띄우고 인텐트를 넘기지 않는다 — 오퍼 칩과 같은 규칙이다.
  const external = banner.url.startsWith('http')

  return (
    <div
      className={`banner banner--${position}${banner.soldOut ? ' banner--soldout' : ''}`}
      style={palette}
      ref={cardRef}
    >
      <a
        className="banner__link"
        href={banner.url}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        onClick={() => track('banner_click', {
          banner: banner.id,
          brand: banner.brand ?? 'none',
          platform: banner.platform,
          position,
        })}
      >
        {/* 로고와 플랫폼 배지는 한 덩어리다 — 배지가 로고 위에 얹혀야
            "이 브랜드를 이 앱에서"가 한 눈에 읽힌다. 앱 전체 행사면
            로고 자리에 이미 같은 아이콘이 있으니 겹쳐 그리지 않는다. */}
        <span className="banner__logo">
          {banner.brands?.length > 1 ? (
            /* 한 장에 묶인 브랜드. 2×2 격자로 그려 "누구누구가"를 한 번에
               읽게 한다 — 대표 하나만 그리면 나머지가 안 보인다(2026-09-15
               쿠팡이츠 60계·처갓집·반올림 8,000원). 앱 배지가 판 오른쪽 위로
               빠져(2026-09-16) 네 칸을 다 브랜드에 쓴다. */
            <span className="banner__logos" data-count={Math.min(banner.brands.length, 4)}>
              {banner.brands.slice(0, 4).map((name) => <BrandLogo key={name} name={name} />)}
            </span>
          ) : banner.brand
            ? <BrandLogo name={banner.brand} />
            : (
              <span className="brand-logo brand-logo--platform">
                <img src={platformIconSrc(banner.platform)} alt={platform?.label ?? banner.platform} />
              </span>
            )}
        </span>
        {/* 앱 배지는 로고 밖, 카드(.banner__link)의 오른쪽 위에 선다(2026-09-16). */}
        {banner.brand && (
          <span className="banner__platform">
            <img src={platformIconSrc(banner.platform)} alt={platform?.label ?? banner.platform} />
          </span>
        )}

        {/* 금액이 먼저, 기간과 조건이 그 아래. 셋을 한 세로줄로 두면
            눈이 왼쪽 로고에서 오른쪽으로 한 번만 건너간다 — 금액과
            설명이 좌우로 갈라져 있으면 두 번 건너가야 했다. */}
        <span className="banner__text">
          {/* 금액 / 브랜드·기간 / 조건 — 폭과 무관하게 세 줄(App.css
              .banner__when). 금액은 혼자 한 줄이라 어느 배너든 같은 자리에
              같은 크기로 선다. 조건은 길이가 들쭉날쭉해 맨 아래다. */}
          <span className="banner__headline">
            {/* 폭이 넓은 금액 문구는 작게(App.css .banner__amount--long).
                "1,000/2,000원 중복할인"이 360px에서 두 줄로 접혀 그 장만
                키가 커지고 다른 장 아래에 빈 띠를 남겼다(2026-09-16).
                글자 수가 아니라 폭 추정으로 정한다 — "6,000/5,000/8,000원"은
                15자지만 숫자라 한 줄에 들어간다. */}
            <span className={`banner__amount${amountIsWide(banner.amount) ? ' banner__amount--long' : ''}`}>
              {banner.amount}
            </span>
            <span className="banner__when">
              {/* 로고만으로는 어느 브랜드인지 안 읽힌다 — 로고 파일이 없으면
                  첫 글자만 남고, 있어도 글자 없는 심볼이면 알아볼 수 없다.
                  기간 왼쪽에 붙여 "누구를 언제"가 한 호흡에 읽히게 한다.
                  전엔 금액 옆에 붙었는데 묶음 배너(브랜드 셋)에선 금액 줄이
                  접히거나 이름이 잘렸다(2026-09-16). 앱 전체 행사(brand
                  없음)면 앱 이름을 대신 쓴다. */}
              <span className="banner__brand">
                {banner.brands?.length > 1
                  ? banner.brands.join(' · ')
                  : (banner.brand ?? platform?.label ?? banner.platform)}
              </span>
              <span className="banner__period">{banner.period}</span>
              {/* 다 나갔어도 배너는 남긴다. 사라지면 "원래 없었나" 싶고,
                  남아 있으면 "오늘은 늦었다"가 읽혀 내일 일찍 오게 된다. */}
              {banner.soldOut && <span className="banner__soldout">오늘 소진</span>}
            </span>
          </span>
          {banner.extra && <span className="banner__extra">{banner.extra}</span>}
        </span>
      </a>

      {onClose && (
        <button type="button" className="banner__close" aria-label="배너 오늘 하루 닫기" onClick={onClose}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      )}

    </div>
  )
}

// 아래 테두리 자리에서 5초를 채우는 막대. 다 차면 다음 장으로 넘어간다.
//
// setInterval로 돌리던 것을 이 막대가 대신한다 — 타이머와 화면이 따로
// 돌면 손으로 넘긴 직후 남은 시간이 어긋나 곧바로 또 넘어간다. key가
// 바뀌면 React가 요소를 새로 만들어 애니메이션이 처음부터 다시 돈다.
//
// prefers-reduced-motion이면 자동 전환을 안 하므로 막대도 안 그린다.
//
// runId에는 '지금 몇 번째 장인가'만 넣는다. 멈춤 여부까지 넣으면 손을
// 올릴 때마다 key가 바뀌어 요소가 새로 만들어지고, 멈추는 대신 처음부터
// 다시 돈다. 멈춤은 key가 아니라 animation-play-state가 한다.
// 막대는 상단·하단 두 곳에 뜨는데 넘기는 것은 하나만 한다. 둘 다
// onAnimationEnd로 넘기면 한 번에 두 장이 지나간다. 같은 runId와 같은
// 시간으로 같이 마운트되므로 둘은 저절로 같은 속도로 찬다.
// 금액 문구가 360px 배너의 한 줄을 넘길지. 한글은 숫자·기호의 두 배쯤
// 넓다(1.45rem에서 한글 ≈ 21px, 숫자 ≈ 13px). 한글 1.7, 띄어쓰기 .5, 그 외
// .6으로 세어 14를 넘으면 넓은 것으로 본다.
//   "최대 7,000원" 8.6 · "6,000/5,000/8,000원" 11.9 · "1,000/2,000원 중복할인" 15.6
// 문턱 14 → 11(2026-09-16): 로고 영역과 여백을 키워 글줄 폭이 195px로 줄자
// 11.9짜리도 한 줄에 안 들어갔다.
export function amountIsWide(text) {
  if (!text) return false
  let w = 0
  for (const ch of text) {
    if (/[가-힣]/.test(ch)) w += 1.7
    else if (ch === ' ') w += .5
    else w += .6
  }
  return w > 11
}

// 멈춤/재생 버튼을 감싸는 진행 링(사용자 결정 2026-09-16). 테두리가 다 차면
// 다음 장 — 채우는 시간은 ROTATE_MS 한 곳에서 정하고 CSS가 읽는다. runId가
// 바뀌면 요소가 새로 만들어져 처음부터 다시 돈다. 멈춤은 key가 아니라
// animation-play-state가 한다(손을 올릴 때마다 처음부터 돌면 안 된다).
// 상단 링만 onDone으로 넘기고, 도크 링은 같은 runId로 같이 도는 그림이다.
const RING_R = 12
const RING_C = 2 * Math.PI * RING_R
function ProgressRing({ runId, paused, onDone }) {
  return (
    <svg key={runId} className="banner__ring" viewBox="0 0 28 28" aria-hidden="true">
      <circle className="banner__ring-track" cx="14" cy="14" r={RING_R} />
      <circle
        className={`banner__ring-fill ${paused ? 'banner__ring-fill--paused' : ''}`}
        cx="14" cy="14" r={RING_R}
        style={{ '--rotate': `${ROTATE_MS}ms`, '--c': RING_C }}
        onAnimationEnd={onDone}
      />
    </svg>
  )
}

// 캐러셀 조작(사용자 결정 2026-09-16). 점·선 대신:
//   - 우측 하단 묶음: "n / N" 카운터 + 멈춤/재생 (모든 화면)
//   - 배너 좌우 가장자리의 이전/다음 화살표 (손가락 화면에서는 숨긴다 —
//     옆으로 미는 것이 곧 이동이라 화살표는 자리만 먹는다, App.css)
function Controls({ count, index, onPrev, onNext, rotating, held, onToggleHold, arrows = true, runId, paused, onDone }) {
  return (
    <>
      {/* 화살표는 상단에만. 도크는 맨 위로 버튼·카드 로고와 겹쳐 뺐다
          (사용자 지적 2026-09-16). */}
      {arrows && (
        <>
          <button type="button" className="banner__arrow banner__arrow--prev" aria-label="이전 배너" onClick={onPrev}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="banner__arrow banner__arrow--next" aria-label="다음 배너" onClick={onNext}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}
      <div className="banner__ctl">
        <span className="banner__counter" aria-live="polite">
          <b>{index + 1}</b> / {count}
        </span>
        {rotating && (
          <button
            type="button"
            className="banner__ctl-btn"
            aria-label={held ? '자동 넘김 재생' : '자동 넘김 멈춤'}
            aria-pressed={held}
            onClick={onToggleHold}
          >
            <ProgressRing runId={runId} paused={paused} onDone={onDone} />
            {held ? (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z" /></svg>
            ) : (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.5" height="14" rx="1" /><rect x="13.5" y="5" width="4.5" height="14" rx="1" /></svg>
            )}
          </button>
        )}
      </div>
    </>
  )
}

export default function EventBanner({ banners }) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  // 사용자가 멈춤 버튼으로 세운 상태. 손을 올린 것과 달리 다시 누를 때까지 간다.
  const [held, setHeld] = useState(false)
  const [focused, setFocused] = useState(false)
  const [topVisible, setTopVisible] = useState(true)
  const [dismissed, setDismissed] = useState(readDismissed)
  const topRef = useRef(null)
  const dockRef = useRef(null)
  // 같은 장을 한 번만 센다. 캐러셀은 앞뒤로 오갈 수 있고 하단 배너는
  // 스크롤을 오르내릴 때마다 다시 들어온다 — 그때마다 세면 노출이
  // 실제보다 몇 배로 부풀어 클릭률이 무의미해진다. 위/아래는 따로 센다.
  const seen = useRef(new Set())

  const markSeen = (banner, position) => {
    const key = `${banner.id}:${position}`
    if (seen.current.has(key)) return
    seen.current.add(key)
    track('banner_impression', {
      banner: banner.id,
      brand: banner.brand ?? 'none',
      platform: banner.platform,
      position,
    })
  }


  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const pageHidden = usePageHidden()

  const count = banners?.length ?? 0
  const current = count > 0 ? banners[index % count] : null

  // 막대와 점은 카드 밖 층이라 카드가 들고 있는 --banner-* 를 못 받는다.
  // 지금 보고 있는 장의 팔레트를 슬롯에 얹어 막대가 그 브랜드 색으로
  // 차오르게 한다. 판은 한 색으로 고정돼 있으므로 색이 겹칠 일이 없다.
  const currentSeed = useSeed(current ?? { platform: 'baemin' })
  const currentPalette = useMemo(() => bannerPalette(currentSeed), [currentSeed])

  // ── 슬라이더 ────────────────────────────────────────────────────────
  // 컴포넌트를 스크롤로 넘기지 않는다. 장 전체(앞뒤 사본 포함)를 한 줄로
  // 그려 놓고 **자리(slot) 하나만 상태로** 들고, 그 값을 transform으로
  // 옮긴다(사용자 결정 2026-09-16). 스크롤 컨테이너 방식은 scrollend·스냅
  // 재정렬·상단/도크 동기화가 브라우저마다 달라 이음새가 났다. 이 방식은
  // 상단과 도크가 같은 slot을 같은 transition으로 보므로 둘이 어긋날 길이
  // 없고, 사본 칸에 도착한 뒤 transition을 끈 채 실제 칸으로 옮기는 것도
  // 우리가 정한 시점에 정확히 한다.
  //
  //   slot: 0 = 마지막 장 사본, 1..count = 실제 장, count+1 = 첫 장 사본
  //   anim: transition을 켤지 — 사본→실제 칸 되감기는 끄고 옮긴다
  const slides = useMemo(() => withSentinels(banners ?? []), [banners])
  const [slot, setSlot] = useState(count > 1 ? 1 : 0)
  const [anim, setAnim] = useState(true)
  const busy = useRef(false)
  useEffect(() => { setSlot(count > 1 ? 1 : 0) }, [count])
  useEffect(() => { setIndex(slotToIndex(slot, count)) }, [slot, count])

  // 옆 칸으로. 사본에 도착하면 transition이 끝난 뒤 실제 칸으로 소리 없이.
  function step(dir) {
    if (count < 2 || busy.current) return
    const next = slot + dir
    if (next < 0 || next > count + 1) return
    busy.current = true
    setAnim(!reduceMotion)
    setSlot(next)
    const real = settleSlot(next, count)
    const dur = reduceMotion ? 0 : SLIDE_MS
    setTimeout(() => {
      if (real !== null) {
        setAnim(false)
        setSlot(real)
        // 한 프레임 뒤 transition을 다시 켠다 — 같이 켜면 되감기도 미끄러진다.
        requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)))
      }
      busy.current = false
    }, dur + 20)
  }
  // 특정 장으로(현재 안 쓰는 점 이동 경로 — 카운터에서 쓰일 수 있다).
  const scrollTo = (i) => step(indexToSlot(i, count) - slot)
  function advance() { step(1) }

  // 손가락·마우스로 끌기. 끄는 동안은 transition 없이 따라오고, 놓으면
  // 40px 넘게 밀었을 때만 한 칸 넘긴다. 세로 스크롤이 더 크면 넘기지 않는다.
  const drag = useRef(null)
  const [dragX, setDragX] = useState(0)
  function onPointerDown(e) {
    if (count < 2 || e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) < 6) return
    if (!d.moved && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return }
    d.moved = true
    setDragX(dx)
  }
  function onPointerUp(e) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const dx = e.clientX - d.x
    setDragX(0)
    if (d.moved && Math.abs(dx) > 40) step(dx < 0 ? 1 : -1)
  }
  // 끌던 중 링크 클릭이 나가지 않게 — 놓는 순간 click이 한 번 더 온다.
  function onClickCapture(e) { if (Math.abs(dragX) > 6) { e.preventDefault(); e.stopPropagation() } }
  const dragProps = {
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture,
  }
  const trackStyle = {
    transform: `translateX(calc(${-slot} * (100% + ${SLIDE_GAP}px) + ${dragX}px))`,
    transition: anim && dragX === 0 && !reduceMotion ? `transform ${SLIDE_MS}ms cubic-bezier(.22, .8, .3, 1)` : 'none',
  }

  // 자동 전환. 한 건이면 돌릴 것이 없고, 손이 올라가 있거나 포커스가 안에
  // 있거나 탭이 숨겨져 있으면 멈춘다. prefers-reduced-motion이면 아예 안 돈다
  // (DNT·GPC를 존중하는 이 레포 관례와 결이 맞는다).
  const paused = hovered || focused || pageHidden || held || dragX !== 0
  const rotating = count > 1 && !reduceMotion

  // 하단 배너는 안 보일 때도 DOM에 남아 있다(visibility:hidden). 관찰자는
  // visibility를 보지 않아 그대로 달면 페이지를 열자마자 노출로 세어진다.
  // 떠 있는 조건이 이미 여기 상태로 있으니 그 조건으로 직접 센다 — 하단
  // 배너는 화면에 고정이라 떠 있으면 곧 보이는 것이다.
  useEffect(() => {
    if (topVisible || dismissed || !current) return
    markSeen(current, 'bottom')
  }, [topVisible, dismissed, current])

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

  // 이 배너가 하단에 떠 있으면 설문 알약이 그 바로 위에 붙어야 한다.
  // 처음엔 "맨 위로 버튼 위 여백 + 배너 높이"를 더해 띄웠다가, 배너가
  // 떠 있을 때는 맨 위로 버튼 몫까지 같이 더해져 이중으로 밀렸다(실측
  // 375px에서 카드 영역까지 들어감). 배너가 떠 있는 동안은 그 여백을
  // 빼고 배너 높이 + 작은 틈만 더한다 — .has-bottom-banner가 이 갈림을
  // CSS 쪽에 알린다. 높이는 실측한다(2줄로 접히는 등 내용에 따라
  // 달라져 고정값을 못 쓴다).
  useEffect(() => {
    const root = document.documentElement
    const set = (h) => root.style.setProperty('--banner-dock-h', `${h}px`)
    const shown = !topVisible && !dismissed
    root.classList.toggle('has-bottom-banner', shown)

    const el = dockRef.current
    if (!shown || !el || typeof ResizeObserver === 'undefined') {
      set(shown && el ? el.offsetHeight : 0)
      return () => root.classList.remove('has-bottom-banner')
    }
    const ro = new ResizeObserver(([entry]) => set(entry.contentRect.height))
    ro.observe(el)
    return () => { ro.disconnect(); root.classList.remove('has-bottom-banner') }
  }, [topVisible, dismissed])

  if (count === 0) return null

  const hoverProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }
  // 배너 위에 얹는 조작·표시는 카드 밖에 둔다. 카드는 가로로 흐르므로
  // 안에 있으면 점도 막대도 같이 흘러가 가운데에서 벗어난다.
  const chrome = (
    <>
      {count > 1 && (
        <Controls
          count={count}
          index={index % count}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          rotating={rotating}
          held={held}
          runId={index % count}
          paused={paused}
          onDone={advance}
          onToggleHold={() => setHeld((h) => { track('banner_autoplay_toggle', { state: h ? 'play' : 'pause' }); return !h })}
        />
      )}
    </>
  )

  return (
    <>
      <div className="banner-slot" ref={topRef} style={currentPalette} {...hoverProps}>
        {/* 전부 한 줄에 깔고 가로로 넘긴다. 자동 전환만 있으면 지나간
            배너를 다시 볼 길이 손가락에 없고, 점을 정확히 눌러야 했다. */}
        {/* 뷰포트가 옆 장을 자른다. 슬롯은 좌우 화살표 여백까지 품고 있어
            슬롯에서 자르면 여백 밑으로 옆 장이 비친다(2026-09-16 900px 실측). */}
        <div className="banner-viewport">
          <div className="banner-track" style={trackStyle} {...dragProps}>
            {slides.map((b, i) => (
              <BannerCard
                /* 사본은 같은 id가 두 번 서므로 칸 번호로 가른다. */
                key={`${b.id}:${i}`}
                banner={b}
                position="top"
                onSeen={() => markSeen(b, 'top')}
              />
            ))}
          </div>
        </div>
        {chrome}
      </div>

      {/* 하단 배너는 항상 DOM에 있고 보임 상태만 토글한다 — 언마운트하면
          되돌아올 때 내려가는 전환이 안 보인다. 안 보일 때는
          visibility:hidden이라 탭 순서에서도 빠진다(App.css). */}
      <div
        ref={dockRef}
        className={`banner-dock ${!topVisible && !dismissed ? 'banner-dock--shown' : ''}`}
        {...hoverProps}
      >
        <div className="banner-dock__inner">
          {/* 하단 도크에는 진행 막대를 안 그린다(사용자 결정 2026-09-15). 넘기는
              타이머는 상단 막대(onDone)가 갖고 있어 동작은 그대로다. */}
          <div className="banner-viewport">
            <div className="banner-track banner-track--dock" style={trackStyle} {...dragProps}>
              {slides.map((b, i) => (
                <BannerCard key={`${b.id}:${i}`} banner={b} position="bottom" />
              ))}
            </div>
          </div>
          {/* 닫기는 도크에 하나다 — 장마다 달면 트랙과 같이 흘러가고 모서리
              밖 위치도 깨진다(2026-09-16). 자리는 전과 같은 도크 우상단 모서리. */}
          <button
            type="button"
            className="banner__close banner-dock__close"
            aria-label="배너 오늘 하루 닫기"
            onClick={() => {
              setDismissed(true)
              writeDismissed()
              // 닫기는 "봤고, 싫다"는 뜻이다 — 무시(노출만 있고 아무 것도
              // 안 함)와 구분해야 배너가 방해가 되는지 알 수 있다.
              track('banner_dismiss', {
                banner: current.id,
                brand: current.brand ?? 'none',
                platform: current.platform,
              })
            }}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
          {/* 도크에도 카운터·멈춤 묶음. 화살표는 없다. */}
          {count > 1 && (
            <Controls
              arrows={false}
              count={count}
              index={index % count}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              rotating={rotating}
              held={held}
              runId={index % count}
              paused={paused}
              onToggleHold={() => setHeld((h) => { track('banner_autoplay_toggle', { state: h ? 'play' : 'pause' }); return !h })}
            />
          )}
        </div>
      </div>
    </>
  )
}
