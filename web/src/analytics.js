// 방문 측정. 자체 서버로 보낸다 — 개인 식별로 이어질 값은 원래 안 받는다.
// Vercel Analytics(main.jsx)와 GA4(ga4.js, 임시)도 별도로 붙어 있다 —
// 셋의 관계는 SiteFooter 고지 문구와 docs/decisions/ADR-002 참고.
//
// 수집하지 않는 것: 원본 IP(서버가 날짜별 솔트로 해시), UA 문자열,
// 유입 URL 원본(direct/internal/external 구분만), 쿠키(localStorage만 씀).
// visitorId는 이 브라우저가 만든 난수라 지우면 그대로 끊긴다.

const API_BASE = 'https://bebeggars.duckdns.org'
const VISITOR_KEY = 'dk_visitor'
const VISITS_KEY = 'dk_visits'
const SESSION_KEY = 'dk_session'
const DEV_KEY = 'dk_dev'

// 추적 거부 신호를 존중한다. 켜져 있으면 아무것도 보내지 않는다.
// ga4.js도 이 판단을 그대로 재사용한다(export).
export function optedOut() {
  return (
    navigator.globalPrivacyControl === true ||
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1'
  )
}

// localStorage가 막힌 환경(사파리 프라이빗 등)에서 통째로 터지면 안 된다.
function safeStore(store, key, value) {
  try {
    if (value === undefined) return store.getItem(key)
    store.setItem(key, value)
    return value
  } catch {
    return null
  }
}

function randomId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

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

function identity() {
  let visitorId = safeStore(localStorage, VISITOR_KEY)
  if (!visitorId) visitorId = safeStore(localStorage, VISITOR_KEY, randomId('v_'))

  let sessionId = safeStore(sessionStorage, SESSION_KEY)
  const isNewSession = !sessionId
  if (isNewSession) sessionId = safeStore(sessionStorage, SESSION_KEY, randomId('s_'))

  // 재방문 회차는 세션이 새로 열릴 때만 올린다(새로고침으로 안 오르게).
  let visits = Number(safeStore(localStorage, VISITS_KEY) || 0)
  if (isNewSession) {
    visits += 1
    safeStore(localStorage, VISITS_KEY, String(visits))
  }
  return { visitorId, sessionId, visitCount: visits || 1 }
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

// 본인 테스트 트래픽 표시. `?dev=1`을 한 번 열면 이 브라우저에 계속 남고
// (`?dev=0`으로 끔), 이후 모든 이벤트에 dev:true가 붙는다. 집계에서는
// jq 'select(.dev != true)'로 걸러낸다 — 실 트래픽 수치가 테스트 클릭으로
// 부풀려지는 걸 막기 위함(2026-07-31).
function isDevSession() {
  const params = new URLSearchParams(location.search)
  if (params.has('dev')) {
    const on = params.get('dev') === '1'
    safeStore(localStorage, DEV_KEY, on ? '1' : '0')
    return on
  }
  return safeStore(localStorage, DEV_KEY) === '1'
}

const context = {
  ...identity(),
  device: window.matchMedia('(hover: hover)').matches ? 'desktop' : 'mobile',
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  referrer: referrerKind(),
  dev: isDevSession() || undefined,
}

let queue = []
let flushTimer = null

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
  queue.push({
    eventId: createEventId(),
    event,
    ...context,
    path: location.pathname,
    props: props ?? undefined,
    clientTs: new Date().toISOString(),
  })
  // 클릭마다 요청을 날리지 않고 잠깐 모은다.
  if (!flushTimer) flushTimer = setTimeout(() => flush(), 3000)
  if (queue.length >= 10) flush()
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
  queue.push({
    eventId: createEventId(),
    event: 'page_exit',
    ...context,
    path: location.pathname,
    dwellMs: activeMs,
    clientTs: new Date().toISOString(),
  })
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
