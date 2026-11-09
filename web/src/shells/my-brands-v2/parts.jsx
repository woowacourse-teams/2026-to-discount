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

// 이동 버튼. 안쪽 왼쪽에 앱 이름을 앱 색 글자로 흰 알약에 넣고, 글자는 가운데. 카드와 시트가 같은 것을 쓴다.
export function GoButton({ link, platform, appLabel }) {
  return (
    <a className="v2-go v2-go--pill" {...link}>
      <span className="v2-go__app" style={{ color: platformColor(platform) }}>{appLabel}</span>
      <span className="v2-go__text">쿠폰 받으러 가기</span>
    </a>
  )
}
