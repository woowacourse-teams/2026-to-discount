import { splitAmount, splitMin } from './data.js'
import baemin from './platform-logos/baemin.png'
import coupangeats from './platform-logos/coupangeats.svg'
import ddangyo from './platform-logos/ddangyo.png'
import yogiyo from './platform-logos/yogiyo.svg'

// 앱 로고(투명 배경, 글자 모양). 배민은 검정 원본을 배민 색(#2AC1BC)으로 새로 칠해 넣었다. 파일은 platform-logos/.
const WORDMARK = { baemin, coupangeats, ddangyo, yogiyo }

// "12,000원 할인": 숫자는 파랑으로 크게, "원 할인"은 검정으로 작게. 이 꼴이 아니면 원문 그대로.
export function Amount({ label, className = '' }) {
  const parts = splitAmount(label)
  if (!parts) return <span className={`${className} v2-plain`}>{label}</span>
  return <span className={className}><span className="v2-num">{parts.num}</span><span className="v2-unit">{parts.rest}</span></span>
}

// "30,000원 이상 주문시": "30,000원 이상"만 주황. 이 꼴이 아니면 원문 그대로.
export function MinOrder({ label }) {
  const parts = splitMin(label)
  return (
    <span className="v2-chip v2-chip--min">
      {parts ? <><span className="v2-min__amt">{parts.amt}</span>{parts.rest}</> : label}
    </span>
  )
}

// 좋아요/싫어요 엄지(CouponCard.jsx ThumbIcon과 같은 그림). 싫어요는 위아래를 뒤집는다.
function Thumb({ down }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g transform={down ? 'matrix(1 0 0 -1 0 24)' : undefined}><path d="M7 10v11H3V10h4zm0 0l4-8c1.5 0 2.5 1.2 2.2 2.7L12.5 8H19a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.7 20H7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></g>
    </svg>
  )
}

// 좋아요 하트. 누르면 채운다.
function Heart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.5s-7.2-4.5-9.4-9C1.1 8.2 2.9 4.8 6.3 4.8c2 0 3.5 1.1 5.7 3.3 2.2-2.2 3.7-3.3 5.7-3.3 3.4 0 5.2 3.4 3.7 6.7-2.2 4.5-9.4 9-9.4 9z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// 좋아요(하트)/싫어요(엄지). 기존 홈 카드와 같은 저장과 이벤트(App.jsx onReact)를 쓴다.
export function Reactions({ name, reaction, onReact }) {
  return (
    <div className="v2-react" role="group" aria-label={`${name} 반응`}>
      <button type="button" aria-label="좋아요" aria-pressed={reaction === 'like'} onClick={() => onReact('like')}><Heart /></button>
      <button type="button" aria-label="싫어요" aria-pressed={reaction === 'dislike'} onClick={() => onReact('dislike')}><Thumb down /></button>
    </div>
  )
}

// 앱 고유색(기존 상단 앱 버튼과 같은 값). 모르는 앱은 회색.
const PLATFORM_COLOR = { baemin: '#2ac1bc', coupangeats: '#f0c090', ddangyo: '#fb521c', yogiyo: '#ff9ab8' } // 파랑 버튼 위 글자색: 앱 색의 같은 색상을 밝게 한 값(배민은 최초 민트 그대로). 쿠팡이츠는 아래 PlatformName이 "쿠팡" 연한 빨강, "이츠" 연한 갈색으로 나눈다
export const platformColor = (key) => PLATFORM_COLOR[key] ?? '#4e5968'

// 배지. 멤버십은 기존 앱처럼 앱마다 색이 다르다(CSS가 data-platform으로 입힌다).
export function Chip({ c }) {
  return <span className={`v2-chip v2-chip--${c.kind}`} data-platform={c.kind === 'membership' ? c.platform : undefined}>{c.text}</span>
}

// 앱 이름. 앱 고유색 글자. 쿠팡이츠는 앞 "쿠팡"과 뒤 "이츠"의 색이 다르다.
const COUPANG_RED = '#ff9a9a'
export function PlatformName({ platform, label }) {
  // 쿠팡이츠: "쿠팡"은 빨강, "이츠"는 갈색
  if (platform === 'coupangeats' && label.endsWith('이츠') && label.length > 2) {
    return <><span style={{ color: COUPANG_RED }}>{label.slice(0, -2)}</span><span style={{ color: platformColor(platform) }}>이츠</span></>
  }
  return <span style={{ color: platformColor(platform) }}>{label}</span>
}

// 앱 로고(직사각형 글자 모양). 시트의 앱 줄에 쓴다. 로고가 없는 앱은 앱 색 글자.
export function PlatformLogo({ platform, label }) {
  const logo = WORDMARK[platform]
  return logo ? <img className="v2-sheet__logo" src={logo} alt={label} /> : <PlatformName platform={platform} label={label} />
}

// 이동 버튼 시안 둘(사용자 테스트로 견준다). 브랜치마다 기본값(BTN_VARIANT)을 박고, 주소에 ?btn=tint|bg를 붙이면 덮는다.
//  tint: 파랑 바탕, 앱 이름만 앱 색을 밝게 한 값(PlatformName)
//  bg:   앱 고유색 바탕(진한 값), 흰 글자만
const BTN_VARIANTS = ['tint', 'bg']
const BTN_VARIANT = 'tint'
const BTN_BG = { baemin: '#2ac1bc', coupangeats: '#6f3a18', ddangyo: '#fb521c', yogiyo: '#fa0050' }
function btnVariant() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('btn')
    if (BTN_VARIANTS.includes(q)) return q
  } catch { /* 주소를 못 읽으면 기본값 */ }
  return BTN_VARIANT
}

// 이동 버튼. 시트와 카드가 같은 것을 쓴다. 글자는 "○○에서 확인하기".
export function GoButton({ link, platform, appLabel }) {
  const variant = btnVariant()
  if (variant === 'bg') {
    return <a className="v2-go" style={{ background: BTN_BG[platform] ?? '#4e5968' }} {...link}>{appLabel}에서 확인하기</a>
  }
  return (
    <a className="v2-go" {...link}>
      <PlatformName platform={platform} label={appLabel} />에서 확인하기
    </a>
  )
}
