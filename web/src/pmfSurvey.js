export const SURVEY_ID = 'pmf-2026-11'
function surveyHash(visitorId, purpose) {
  let hash = 2166136261
  for (const char of `${SURVEY_ID}:${purpose}:${visitorId}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  }
  return hash >>> 0
}

export function surveyArm(visitorId) {
  const bucket = surveyHash(visitorId, 'entry-v1') / 0x100000000
  return bucket < 0.2 ? 'dock' : 'inline'
}

export function inlineSurveyBeforeCard(visitorId) {
  const bucket = surveyHash(visitorId, 'inline-position-v1') / 0x100000000
  if (bucket < 0.4) return 2
  return bucket < 0.8 ? 3 : 4
}

export const PMF_QUESTION = '저희 제품을 더 이상 쓸 수 없다면 어떨거 같으신가요?'
export const PMF_OPTIONS = [
  ['very_disappointed', '매우 실망'], ['somewhat_disappointed', '약간 실망'],
  ['not_disappointed', '실망하지 않음'], ['no_longer_using', '더 이상 쓰지 않음'],
]
export const FOLLOW_UP = [
  { id: 'benefit', title: '가장 도움이 되는 점이 무엇인가요?', options: [
    ['new_discounts', '새로운 할인 확인'], ['compare_apps', '여러 배달앱의 할인 비교'],
    ['save_money', '더 저렴하게 주문할 할인 찾기'], ['conditions', '할인율이 적용된 금액과 조건 확인'],
    ['no_benefit', '아직 도움이 되는 점을 느끼지 못함'], ['other', '기타'],
  ] },
  { id: 'missing', title: '가장 아쉬운 점이 무엇인가요?', options: [
    ['few_discounts', '원하는 브랜드나 할인이 부족함'], ['expired', '이미 끝난 할인이 표시됨'],
    ['hard_to_find', '원하는 할인을 찾기 어려움'], ['conditions', '할인 조건을 이해하기 어려움'],
    ['small_discount', '제공되는 할인 혜택이 기대보다 작음'], ['none', '특별히 아쉬운 점이 없음'], ['other', '기타'],
  ] },
]
const KEY = `dk_survey_${SURVEY_ID}`
export function terminalState(storage = globalThis.localStorage) {
  try { const value = storage.getItem(KEY); return ['answered', 'dismissed'].includes(value) ? value : null } catch { return null }
}
export function rememberTerminal(value, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, value) } catch { /* 서버 기록으로도 중복 참여를 막는다. */ }
}
export function validDraft(draft) {
  return PMF_OPTIONS.some(([key]) => key === draft.choice) && FOLLOW_UP.every(q => {
    const value = draft[q.id]
    return !value || (q.options.some(([key]) => key === value)
      && (value !== 'other' || ((draft[`${q.id}_text`] || '').length <= 200)))
  })
}
export function submission(draft, context) {
  const answers = {}
  for (const q of FOLLOW_UP) {
    if (!draft[q.id]) continue
    answers[q.id] = draft[q.id]
    const text = (draft[`${q.id}_text`] || '').trim()
    if (draft[q.id] === 'other' && text) answers[`${q.id}_text`] = text
  }
  return { visitorId: context.visitorId, sessionId: context.sessionId, surveyId: SURVEY_ID, choice: draft.choice, answers }
}

export function canPreviewSurvey(env) {
  return env.DEV === true || env.VITE_APP_ENV === 'development'
}

export function canAdvanceQuestion(question, draft) {
  const value = draft[question.id]
  return question.options.some(([key]) => key === value)
    && (value !== 'other' || ((draft[`${question.id}_text`] || '').length <= 200))
}
