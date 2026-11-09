import { splitAmount, splitMin } from './data.js'

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

// 이동 버튼. 시트와 카드가 같은 것을 쓴다. 글자는 "○○에서 받으러 가기", 앱 이름 글자만 그 앱의 고유색.
export function GoButton({ link, platform, appLabel }) {
  return (
    <a className="v2-go" {...link}>
      <PlatformName platform={platform} label={appLabel} />에서 받으러 가기
    </a>
  )
}
