const VISITOR_KEY = 'dk_visitor'
const VISITS_KEY = 'dk_visits'
const SESSION_KEY = 'dk_session'
const DEV_KEY = 'dk_dev'
// 운영 호스트. 여기 없는 주소에서 난 이벤트는 dev로 찍힌다.
const PROD_HOSTS = new Set(['beggars-five.vercel.app'])

// localStorage가 막힌 환경(사파리 프라이빗 등)에서 앱까지 멈추지 않게 한다.
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

function createContext() {
  let visitorId = safeStore(localStorage, VISITOR_KEY)
  if (!visitorId) visitorId = safeStore(localStorage, VISITOR_KEY, randomId('v_'))

  let sessionId = safeStore(sessionStorage, SESSION_KEY)
  const isNewSession = !sessionId
  if (isNewSession) sessionId = safeStore(sessionStorage, SESSION_KEY, randomId('s_'))

  let visitCount = Number(safeStore(localStorage, VISITS_KEY) || 0)
  if (isNewSession) {
    visitCount += 1
    safeStore(localStorage, VISITS_KEY, String(visitCount))
  }

  const params = new URLSearchParams(location.search)
  let dev
  if (params.has('dev')) {
    dev = params.get('dev') === '1'
    safeStore(localStorage, DEV_KEY, dev ? '1' : '0')
  } else {
    dev = safeStore(localStorage, DEV_KEY) === '1'
  }
  // 운영 주소가 아니면(프리뷰 배포, localhost) 전부 개발 트래픽이다(2026-09-19). 프리뷰
  // 이벤트가 같은 API·같은 원장으로 들어가는데 호스트 필드가 없어 실사용자와 섞였다.
  // localStorage에 적지는 않는다 — 오리진별 저장소라 운영 주소에는 영향이 없다.
  if (typeof location !== 'undefined' && !PROD_HOSTS.has(location.hostname)) dev = true

  return {
    visitorId,
    sessionId,
    visitCount: visitCount || 1,
    dev: dev || undefined,
  }
}

let context

// 자체 API와 PostHog SDK가 한 페이지에서 반드시 같은 익명 ID를 쓰게 한다.
export function getAnalyticsContext() {
  if (!context) context = createContext()
  return context
}
