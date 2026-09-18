// 플랫폼 목록. 컴포넌트(logos.jsx)와 분리한 순수 모듈 — filters.js와 그 테스트가 쓴다.
export const PLATFORMS = [
  { key: 'baemin', label: '배달의민족', initial: '배' },
  { key: 'coupangeats', label: '쿠팡이츠', initial: '쿠' },
  { key: 'ddangyo', label: '땡겨요', initial: '땡' },
  { key: 'yogiyo', label: '요기요', initial: '요' },
]
export const PLATFORM_BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]))
