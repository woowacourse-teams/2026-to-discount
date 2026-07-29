// 방문 측정. 자체 API로만 보낸다 — 외부 분석 도구를 안 쓰므로 제3자에게
// 넘어가는 데이터가 없다.
//
// 수집하지 않는 것: 원본 IP(서버가 날짜별 솔트로 해시), UA 문자열,
// 유입 URL 원본(direct/internal/external 구분만), 쿠키(localStorage만 씀).
// visitorId는 이 브라우저가 만든 난수라 지우면 그대로 끊긴다.

const API_BASE = 'https://bebeggars.duckdns.org'
const VISITOR_KEY = 'dk_visitor'
const VISITS_KEY = 'dk_visits'
const SESSION_KEY = 'dk_session'

// 추적 거부 신호를 존중한다. 켜져 있으면 아무것도 보내지 않는다.
function optedOut() {
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

const context = {
  ...identity(),
  device: window.matchMedia('(hover: hover)').matches ? 'desktop' : 'mobile',
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  referrer: referrerKind(),
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
