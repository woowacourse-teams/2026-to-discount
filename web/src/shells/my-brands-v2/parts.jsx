import { track } from '../../analytics.js'
import { amountText } from '../../couponModel.js'
import { offerClickProps, offerLink, openWithNotice } from '../../offerLink.js'
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

// 좋아요 하트. 누르면 채운다.
function Heart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.5s-7.2-4.5-9.4-9C1.1 8.2 2.9 4.8 6.3 4.8c2 0 3.5 1.1 5.7 3.3 2.2-2.2 3.7-3.3 5.7-3.3 3.4 0 5.2 3.4 3.7 6.7-2.2 4.5-9.4 9-9.4 9z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// 좋아요(하트). 기존 홈 카드와 같은 저장과 이벤트(App.jsx onReact)를 쓴다. 싫어요 버튼은 두지 않는다.
export function Reactions({ name, reaction, onReact }) {
  return (
    <div className="v2-react" role="group" aria-label={`${name} 반응`}>
      <button type="button" aria-label="좋아요" aria-pressed={reaction === 'like'} onClick={() => onReact('like')}><Heart /></button>
    </div>
  )
}

// 앱 고유색. 이동 버튼 바탕과 시트 앱 줄 글자(로고가 없을 때)에 쓴다. 배민은 앱 민트(#2ac1bc)보다 조금 밝게(2026-11-10 사용자). 모르는 앱은 회색.
const BTN_BG = { baemin: '#36d3ce', coupangeats: '#4d2610', ddangyo: '#fb521c', yogiyo: '#fa0050' }
const appColor = (key) => BTN_BG[key] ?? '#4e5968'

// 배지. 멤버십은 기존 앱처럼 앱마다 색이 다르다(CSS가 data-platform으로 입힌다).
export function Chip({ c }) {
  return <span className={`v2-chip v2-chip--${c.kind}`} data-platform={c.kind === 'membership' ? c.platform : undefined}>{c.text}</span>
}

// 앱 로고(직사각형 글자 모양). 시트의 앱 줄에 쓴다. 로고가 없는 앱은 앱 색 글자.
export function PlatformLogo({ platform, label }) {
  const logo = WORDMARK[platform]
  return logo ? <img className="v2-sheet__logo" src={logo} alt={label} /> : <span style={{ color: appColor(platform) }}>{label}</span>
}

// 앱 이동 링크 속성. 운영 카드(CouponCard.jsx OfferLinkA)와 같은 규칙이다:
// - 주소는 offerLink(수집 링크, 브랜드 링크, 앱 검색 링크, 허브, 앱 기본 링크 순 폴백, 쿠팡이츠는 허브 탭 링크).
// - 웹 주소(http)만 새 탭(noreferrer). 앱 스킴(coupangeats://, baemin:// 등)은 같은 탭이어야 앱이 열린다.
// - 누르면 offer_link_click을 남기고, openWithNotice가 앱 열림 확인, 쿠팡이츠 안내, 설치 안내와 푸시 안내(offerPrompt)를 맡는다.
// where: main(카드 대표 버튼) | sheet(자세히 보기 시트), slot은 1부터.
export function offerLinkProps({ offer, brand, position, best, where, slot, expanded }) {
  const href = offerLink(offer, brand.links, brand.name)
  if (!href) return {}
  const web = href.startsWith('http')
  return {
    href,
    target: web ? '_blank' : undefined,
    rel: web ? 'noreferrer' : undefined,
    'aria-label': `${brand.name} ${amountText(offer)}, 앱으로 이동`,
    onClick: (e) => {
      track('offer_link_click', offerClickProps({ offer, brandName: brand.name, position, pin: brand.pin, best, where, slot, expanded }))
      openWithNotice(e, href, { offerPrompt: true })
    },
  }
}

// 링크로 나가는 표시(상자에서 오른쪽 위로 나가는 화살표). 글자 색을 따른다.
export function ExternalIcon() {
  return (
    <svg className="v2-go__ext" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// 이동 버튼. 시트와 카드가 같은 것을 쓴다. 글자는 "○○에서 확인" 뒤에 링크 이동 아이콘.
export function GoButton({ link, platform, appLabel }) {
  return <a className="v2-go" style={{ background: appColor(platform) }} {...link}>{appLabel}에서 확인<ExternalIcon /></a>
}
