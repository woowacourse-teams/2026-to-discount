// 방문 측정. 자체 서버 원장과 PostHog SDK로 나눈다 — 개인 식별로 이어질
// 값은 원래 안 받는다.
// Vercel Analytics(main.jsx)와 GA4(ga4.js, 임시)도 별도로 붙어 있다 —
// 셋의 관계는 SiteFooter 고지 문구와 docs/decisions/ADR-002 참고.
//
// 수집하지 않는 것: 원본 IP(서버가 날짜별 솔트로 해시), UA 문자열,
// 유입 URL 원본(direct/internal/external 구분만), 쿠키(localStorage만 씀).
// visitorId는 이 브라우저가 만든 난수라 지우면 그대로 끊긴다.

import { getAnalyticsContext } from './analytics-context.js'
import { optedOut } from './privacy.js'
import { uiVariant } from './variant.js'

export { optedOut } from './privacy.js'

const API_BASE = ''  // 같은 오리진 — api.js 주석 참고
const MAX_PENDING_POSTHOG_EVENTS = 100

// 이벤트마다 한 번만 발급하는 UUID다. 이 객체가 메모리 큐에 남아 있는 동안
// sendBeacon 실패 뒤 fetch로 폴백해도 같은 eventId가 PostHog $insert_id까지 간다.
function createEventId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// 유입 원본 URL은 안 보낸다 — 어디서 왔는지 분류만 필요하다.
function referrerKind() {
  const ref = document.referrer
  if (!ref) return 'direct'
  try {
    return new URL(ref).host === location.host ? 'internal' : 'external'
  } catch {
    return 'direct'
  }
}

const context = {
  ...getAnalyticsContext(),
  device: window.matchMedia('(hover: hover)').matches ? 'desktop' : 'mobile',
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  referrer: referrerKind(),
  // 어느 화면 안을 보고 있었는지. 안 붙이면 클릭 수만 쌓이고 "어느
  // 화면에서 눌렀나"를 되짚을 수 없다.
  variant: uiVariant,
}

// 지금 걸려 있는 조건. 링크를 누른 순간 어떤 필터 상태였는지가 "분류를
// 설정한 사람이 실제로 이동까지 하는가"의 답이라, 이벤트마다 실어 보낸다.
// 화면이 바꿔주고 여기서는 들고만 있는다 — 이벤트를 쏘는 자리마다 상태를
// prop으로 끌고 다니면 새 필터가 늘 때 빠뜨린다.
let filterContext = {}

export function setFilterContext(next) {
  filterContext = next
}

let queue = []
let flushTimer = null
let postHogState = 'disabled'
let postHogSink = null
let pendingPostHogEvents = []

function warnPostHog(message, error) {
  if (import.meta.env?.DEV) console.warn(message, error)
}

function captureWithSink(sink, event) {
  try {
    sink(event)
  } catch (error) {
    // SDK 실패가 자체 원장 기록이나 사용자 기능을 막지 않게 한다.
    warnPostHog('PostHog 이벤트 fan-out에 실패했습니다.', error)
  }
}

function fanOutToPostHog(event) {
  if (postHogState === 'ready') {
    captureWithSink(postHogSink, event)
    return
  }
  if (postHogState !== 'buffering') return

  if (pendingPostHogEvents.length >= MAX_PENDING_POSTHOG_EVENTS) {
    warnPostHog('PostHog 대기 큐가 가득 차 새 이벤트를 건너뜁니다.')
    return
  }
  pendingPostHogEvents.push(event)
}

export function enablePostHogFanout() {
  if (postHogState === 'ready') return false
  if (postHogState === 'buffering') return true
  postHogState = 'buffering'
  return true
}

export function registerPostHogSink(sink) {
  if (postHogState !== 'buffering' || typeof sink !== 'function') return false

  const pending = pendingPostHogEvents
  pendingPostHogEvents = []
  for (const event of pending) captureWithSink(sink, event)

  postHogSink = sink
  postHogState = 'ready'
  return true
}

export function disablePostHogFanout() {
  postHogState = 'disabled'
  postHogSink = null
  pendingPostHogEvents = []
}

// main.jsx와 검증 코드가 같은 시작 순서를 사용한다. 첫 page_view 전에 fan-out을
// 켜야 SDK 청크가 준비될 때까지 동일 이벤트 객체를 보관할 수 있다.
export function startAnalyticsDelivery({ postHogConfigured, startPostHog }) {
  if (postHogConfigured) enablePostHogFanout()
  startAnalytics()
  if (postHogConfigured && typeof startPostHog === 'function') startPostHog()
}

function createAnalyticsEvent(event, additions = {}) {
  const { props, ...eventFields } = additions
  return {
    eventId: createEventId(),
    event,
    ...context,
    path: location.pathname,
    ...eventFields,
    // 이벤트 고유 값이 먼저다. 서버가 props를 앞에서부터 세어 자르는데
    // (EventController.MAX_PROPS), 맥락을 앞에 두니 잘리는 쪽이 하필
    // 그 이벤트가 말하려던 값이었다 — banner_impression의 position이
    // 통째로 유실돼 상단/하단 구분이 안 됐다(2026-08-22). 넘치면 맥락이
    // 먼저 떨어져야 한다.
    props: (props || Object.keys(filterContext).length)
      ? { ...props, ...filterContext }
      : undefined,
    clientTs: new Date().toISOString(),
  }
}

function enqueue(event, scheduleFlush = true) {
  queue.push(event)
  fanOutToPostHog(event)

  if (!scheduleFlush) return
  // 클릭마다 요청을 날리지 않고 잠깐 모은다.
  if (!flushTimer) flushTimer = setTimeout(() => flush(), 3000)
  if (queue.length >= 10) flush()
}

function post(body, useBeacon) {
  const url = `${API_BASE}/api/events`
  const json = JSON.stringify(body)
  // 페이지가 닫히는 중에는 fetch가 취소된다. 체류 시간이 바로 그 순간에
  // 나오므로 sendBeacon이 없으면 체류 데이터가 통째로 유실된다.
  //
  // 단, 비콘은 반드시 text/plain으로 보낸다. application/json은 CORS
  // 프리플라이트를 유발하는데 sendBeacon은 프리플라이트를 못 해서 아무
  // 경고 없이 그냥 사라진다(실제로 이 방식으로 체류 데이터가 통째로
  // 유실됐다). text/plain은 단순 요청이라 프리플라이트가 없다 —
  // 서버는 본문을 문자열로 받아 직접 파싱한다.
  if (useBeacon && navigator.sendBeacon) {
    // 큐잉에 실패하면(false) fetch로 한 번 더 시도한다. true를 받았는데도
    // 실제로 안 나가는 환경이 있어 이걸로 전부 막지는 못하지만, 확실히
    // 실패한 경우까지 버릴 이유는 없다.
    if (navigator.sendBeacon(url, new Blob([json], { type: 'text/plain;charset=UTF-8' }))) return
  }
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    keepalive: true,
  }).catch(() => {})
}

function flush(useBeacon = false) {
  if (queue.length === 0) return
  const batch = queue
  queue = []
  clearTimeout(flushTimer)
  flushTimer = null
  post(batch, useBeacon)
}

export function track(event, props) {
  if (optedOut()) return
  enqueue(createAnalyticsEvent(event, {
    props,
  }))
}

// 체류 시간은 "보고 있던 시간"이어야 한다. 탭을 백그라운드로 돌린 시간은
// 빼야 실제로 읽은 시간에 가까워진다.
let visibleSince = document.visibilityState === 'visible' ? Date.now() : null
let activeMs = 0
let exitSent = false

function accumulate() {
  if (visibleSince != null) {
    activeMs += Date.now() - visibleSince
    visibleSince = null
  }
}

function sendExit() {
  if (optedOut() || exitSent) return
  accumulate()
  exitSent = true
  enqueue(createAnalyticsEvent('page_exit', {
    dwellMs: activeMs,
  }), false)
  flush(true)
}

export function startAnalytics() {
  if (optedOut()) return
  track('page_view')

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      visibleSince = Date.now()
      exitSent = false
    } else {
      // 모바일에서는 탭 전환이 곧 이탈인 경우가 많아 여기서 확정 전송한다.
      sendExit()
    }
  })
  // pagehide가 모바일 사파리 포함해 가장 확실하게 불린다.
  window.addEventListener('pagehide', sendExit)
}
