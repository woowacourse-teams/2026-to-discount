const VISITOR_KEY = 'dk_visitor'
const VISITS_KEY = 'dk_visits'
const SESSION_KEY = 'dk_session'
const DEV_KEY = 'dk_dev'

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
