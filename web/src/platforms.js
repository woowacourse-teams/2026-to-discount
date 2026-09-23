// 플랫폼 목록. 컴포넌트(logos.jsx)와 분리한 순수 모듈 — filters.js와 그 테스트가 쓴다.
export const PLATFORMS = [
  { key: 'baemin', label: '배달의민족', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
export const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))

// 브랜드 자체 앱이나 사이트의 행사. 배달앱이 아니라 필터에 안 들어간다.
export const OWN = 'own'

// 제휴 결제 수단. 아이콘에만 쓴다 — 필터가 고르는 것은 "어느 배달앱으로 시킬까"인데
// 결제 수단은 그 질문의 답이 아니다.
export const PARTNERS = [
  { key: 'naverpay', label: '네이버페이', initial: 'N' },
]

// Object.create(null): 평범한 객체 리터럴은 Object.prototype을 물려받아
// iconFor('constructor')가 함수를 돌려준다. 프로토타입 없는 객체로 막는다.
export const ICON_BY_KEY = [...PLATFORMS, ...PARTNERS].reduce((acc, p) => {
  acc[p.key] = p
  return acc
}, Object.create(null))

/**
 * 이 오퍼에 그릴 아이콘. 없으면 null이고 부르는 쪽이 브랜드 로고로 떨어진다.
 *
 * via가 platform을 이긴다 — 백억커피 네이버페이 적립은 앱이 아니라 결제 수단이
 * 알아볼 표식이다. 모르는 키는 null이다: 예전에는 PLATFORM_BY_KEY[key].key를 바로
 * 읽어 own에서 TypeError가 났고, 웹에 에러 경계가 없어 페이지 전체가 안 그려졌다.
 */
export function iconFor(platformKey, via) {
  return ICON_BY_KEY[via] ?? ICON_BY_KEY[platformKey] ?? null
}
