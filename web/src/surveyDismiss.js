// 설문을 다시 띄울지 말지. 개인 상태라 브라우저에 둔다 — visitorId가 이미
// 지는 한계(지우면 초기화)를 같이 진다. 서버에 두지 않는 이유는 이것이
// 리워드 조건이 아니기 때문이다. 지워 봐야 설문이 한 번 더 뜰 뿐, 대상
// 판정과 1인 1회는 서버가 원장으로 따로 막는다.
const DISMISS_KEY = 'dk_survey_dismissed'   // 닫은 시각들(콤마로 이어 붙인다)
const ANSWERED_KEY = 'dk_survey_answered'

const DAY = 24 * 60 * 60 * 1000
const COOLDOWN = 3 * DAY
const MAX_DISMISSALS = 2

function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    // 사파리 프라이빗 등. 못 읽으면 아무것도 안 한 것으로 본다.
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 못 적으면 다음에 또 뜬다 — 리워드는 서버가 막으므로 손해가 없다 */
  }
}

function dismissals() {
  const raw = read(DISMISS_KEY)
  if (!raw) return []
  return raw.split(',').map(Number).filter((n) => Number.isFinite(n))
}

export function shouldShow(now = Date.now()) {
  if (read(ANSWERED_KEY)) return false

  const times = dismissals()
  if (times.length === 0) return true
  // 두 번 닫았으면 관심이 없다는 뜻이다. 더 묻지 않는다.
  if (times.length >= MAX_DISMISSALS) return false
  return now - times[times.length - 1] >= COOLDOWN
}

export function markDismissed(now = Date.now()) {
  write(DISMISS_KEY, [...dismissals(), now].join(','))
}

export function markAnswered() {
  write(ANSWERED_KEY, '1')
}
