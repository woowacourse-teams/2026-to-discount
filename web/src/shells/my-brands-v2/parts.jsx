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

// 앱 고유색(기존 상단 앱 버튼과 같은 값). 모르는 앱은 회색.
const PLATFORM_COLOR = { baemin: '#2ac1bc', coupangeats: '#d62d34', ddangyo: '#f5a623', yogiyo: '#fa0050' }
export const platformColor = (key) => PLATFORM_COLOR[key] ?? '#4e5968'

// 배지. 멤버십은 기존 앱처럼 앱마다 색이 다르다(CSS가 data-platform으로 입힌다).
export function Chip({ c }) {
  return <span className={`v2-chip v2-chip--${c.kind}`} data-platform={c.kind === 'membership' ? c.platform : undefined}>{c.text}</span>
}

// 앱 이름. 앱 고유색 글자. 쿠팡이츠는 글자마다 색이 다르다(쿠 팡 이 츠).
const COUPANG_CHAR_COLORS = ['#52100F', '#93BB2E', '#EA9919', '#E94B22']
export function PlatformName({ platform, label }) {
  if (platform === 'coupangeats' && [...label].length === COUPANG_CHAR_COLORS.length) {
    return [...label].map((ch, i) => <span key={i} style={{ color: COUPANG_CHAR_COLORS[i] }}>{ch}</span>)
  }
  return <span style={{ color: platformColor(platform) }}>{label}</span>
}

// 앱 로고(직사각형 글자 모양). 시트의 앱 줄에 쓴다. 로고가 없는 앱은 앱 색 글자.
export function PlatformLogo({ platform, label }) {
  const logo = WORDMARK[platform]
  return logo ? <img className="v2-sheet__logo" src={logo} alt={label} /> : <PlatformName platform={platform} label={label} />
}

// 이동 버튼. 시트와 카드가 같은 것을 쓴다. 글자만 "○○에서 확인하기", 바탕색이 그 앱의 고유색.
export function GoButton({ link, platform, appLabel }) {
  return (
    <a className="v2-go" style={{ background: platformColor(platform) }} {...link}>
      {appLabel}에서 확인하기
    </a>
  )
}
