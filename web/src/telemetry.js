// 실사용 측정 묶음(2026-10-14): 앱 열림 결과, 웹 바이탈, 클라이언트 오류, 인앱 브라우저.
// 화면에는 아무것도 그리지 않는다. 모듈을 읽는 순간 window를 만지지 않는다(SSR이 ErrorBoundary를 거쳐 이 파일을 읽는다).
import { track } from './analytics.js'

// 카카오톡 인앱 브라우저. UA 원문은 안 보낸다(analytics.js 머리말) — 참/거짓만.
export const inApp = () => typeof navigator !== 'undefined' && /KAKAOTALK/i.test(navigator.userAgent)
// 홈 화면에 설치해 연 것인지
export const standalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)

// 숨김/이탈 신호를 analytics.js의 page_exit 전송보다 먼저 받는다. 그쪽은 document·window의 버블 단계에서
// 큐를 비콘으로 비우므로, window 캡처 단계에서 이벤트를 넣어야 같은 비콘에 실린다.
function onLeave(fn) {
  const hidden = () => { if (document.visibilityState === 'hidden') fn('hidden') }
  const hide = () => fn('pagehide')
  window.addEventListener('visibilitychange', hidden, true)
  window.addEventListener('pagehide', hide, true)
  return () => {
    window.removeEventListener('visibilitychange', hidden, true)
    window.removeEventListener('pagehide', hide, true)
  }
}

const platformOf = (href) => (/coupang/i.test(href) ? 'coupangeats'
  : /baemin/i.test(href) ? 'baemin'
    : /yogiyo/i.test(href) ? 'yogiyo'
      : /ddangyo/i.test(href) ? 'ddangyo' : 'other')

// 앱을 열려고 이동한 직후 2.5초 안에 페이지가 가려졌는지(=앱이 떴는지). 결과는 한 번만 보낸다.
// blur는 따로 싣는다 — 크롬은 앱이 뜨는 동안에도 잠시 visible이다(offerLink.js 쿠팡이츠 주석, 2026-10-07 실기).
// ponytail: 같은 탭 https 이동(유니버설 링크가 아니면 웹으로 넘어감)도 hidden이라 opened=true로 센다. 스킴 칸으로 가른다.
let watching = false
export function watchAppOpen(href, ms = 2500) {
  if (watching || typeof window === 'undefined' || typeof href !== 'string') return
  watching = true
  let blurred = false
  const blur = () => { blurred = true }
  window.addEventListener('blur', blur)
  const props = { platform: platformOf(href), scheme: href.split(':')[0], inApp: inApp() }
  const done = (opened, signal) => {
    if (!watching) return
    watching = false
    clearTimeout(timer)
    stop()
    window.removeEventListener('blur', blur)
    track('app_open_result', { ...props, opened, signal, blurred })
  }
  const stop = onLeave((signal) => done(true, signal))
  const timer = setTimeout(() => done(false, 'timeout'), ms)
}

// 웹 바이탈. web-vitals 패키지가 없어 PerformanceObserver로 직접 잰다. 페이지가 처음 가려질 때 한 건.
// ponytail: INP는 상호작용 최댓값(상호작용 50회 미만이면 web-vitals의 p98과 같다). 그보다 많으면 약간 비관적이다.
export function startWebVitals() {
  if (typeof PerformanceObserver === 'undefined') return
  const v = { lcp: null, inp: null, cls: 0, ttfb: null }
  const observe = (type, cb, opts = {}) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true, ...opts }) } catch { /* 지원 안 함 */ }
  }
  observe('largest-contentful-paint', (e) => { v.lcp = Math.round(e.startTime) })
  observe('event', (e) => { if (e.interactionId && e.duration > (v.inp ?? -1)) v.inp = e.duration }, { durationThreshold: 16 })
  // CLS: 1초 간격·최대 5초 세션 창 중 가장 큰 합(web-vitals와 같은 정의)
  let win = 0; let first = 0; let last = 0
  observe('layout-shift', (e) => {
    if (e.hadRecentInput) return
    if (win && e.startTime - last < 1000 && e.startTime - first < 5000) win += e.value
    else { win = e.value; first = e.startTime }
    last = e.startTime
    if (win > v.cls) v.cls = win
  })
  const nav = performance.getEntriesByType?.('navigation')?.[0]
  if (nav) v.ttfb = Math.round(nav.responseStart)
  let sent = false
  onLeave(() => {
    if (sent) return
    sent = true
    track('web_vitals', { ...v, cls: Math.round(v.cls * 1000) / 1000, inApp: inApp() })
  })
}

// 클라이언트 오류. 페이지당 5건, 같은 메시지는 한 번.
const MAX_ERRORS = 5
const seen = new Set()
export function reportError(kind, error, where) {
  if (typeof window === 'undefined') return
  const message = String(error?.message ?? error ?? '').slice(0, 120)
  const key = `${kind}:${message}`
  if (seen.size >= MAX_ERRORS || seen.has(key)) return
  seen.add(key)
  track('client_error', {
    kind,
    message,
    // 컴포넌트 스택 첫 줄(어느 컴포넌트에서)
    ...(where ? { where: String(where).trim().split('\n')[0].trim().slice(0, 120) } : {}),
    inApp: inApp(),
  })
}

export function startErrorReporting() {
  window.addEventListener('error', (e) => reportError('error', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason))
}

// hydrateRoot 옵션. 하이드레이션 복구(#421 등)를 센다. 콘솔 출력은 React 기본처럼 남긴다.
export function onRecoverableError(error, info) {
  console.error(error)
  reportError('recoverable', error, info?.componentStack)
}
