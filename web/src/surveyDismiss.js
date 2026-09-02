// 설문을 다시 띄울지 말지. 개인 상태라 브라우저에 둔다 — visitorId가 이미
// 지는 한계(지우면 초기화)를 같이 진다. 서버에 두지 않는 이유는 이것이
// 리워드 조건이 아니기 때문이다. 지워 봐야 설문이 한 번 더 뜰 뿐, 대상
// 판정과 1인 1회는 서버가 원장으로 따로 막는다.
const DISMISS_KEY = 'dk_survey_dismissed'   // 닫은 시각들(콤마로 이어 붙인다)
const ANSWERED_KEY = 'dk_survey_answered'
// 발급받은 코드/링크. 연락처를 안 받으므로 이 브라우저에 남겨 두는 것이
// 다시 볼 수 있는 유일한 길이다 — 지우면 못 찾는다(서버도 다시 안 준다.
// GifticonStore.issue는 인당 한 번만 내준다).
const CODE_KEY = 'dk_survey_code'

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

// 답했다고 알약 자체를 영구히 숨기던 것을 뺐다 — 코드를 한 번 보고 지나친
// 사람이 다시 찾아올 길이 없어진다(연락처를 안 받으므로). 닫기(3일 쉬고,
// 두 번째면 영구)는 그대로 존중한다 — "관심 없다"는 뜻은 답했든 안
// 답했든 같다.
export function shouldShow(now = Date.now()) {
  const times = dismissals()
  if (times.length === 0) return true
  if (times.length >= MAX_DISMISSALS) return false
  return now - times[times.length - 1] >= COOLDOWN
}

export function markDismissed(now = Date.now()) {
  write(DISMISS_KEY, [...dismissals(), now].join(','))
}

// code를 같이 넘기면 다시 볼 수 있게 저장한다. 재고가 없어 코드를 못
// 받은 경우(SurveyCard의 noStockDone)는 여기를 안 부른다 — "답했다"로
// 치면 재고가 차도 다시 시도를 못 한다.
export function markAnswered(code) {
  write(ANSWERED_KEY, '1')
  if (code) write(CODE_KEY, code)
}

/** 저장된 코드/링크. 없으면 null — 아직 안 답했거나 재고 없이 답한 것. */
export function getStoredCode() {
  return read(CODE_KEY)
}
