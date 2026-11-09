import test from 'node:test'
import assert from 'node:assert/strict'
import { SURVEY_ID, terminalState, rememberTerminal, validDraft, submission, canPreviewSurvey, canAdvanceQuestion, FOLLOW_UP } from './pmfSurvey.js'

test('이전 설문 닫기와 쿠폰 기록은 PMF 응답을 막지 않는다', () => {
  const map = new Map([['dk_survey_dismissed', '1,2'], ['dk_survey_answered', '1'], ['dk_survey_code', 'old-link']])
  const storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) }
  assert.equal(terminalState(storage), null)
  rememberTerminal('dismissed', storage)
  assert.equal(terminalState(storage), 'dismissed')
  assert.equal(map.get('dk_survey_code'), 'old-link')
})
test('선택 응답을 건너뛰고 공통 PMF 문항만 제출 가능', () => {
  assert.equal(validDraft({ choice: 'very_disappointed' }), true)
  assert.equal(validDraft({ choice: '' }), false)
  assert.equal(validDraft({ choice: 'save_money' }), false)
})
test('기타 직접 입력은 선택이며 작성한 경우에만 전송한다', () => {
  const draft = { choice: 'not_disappointed', benefit: 'other', benefit_text: '   ' }
  assert.equal(validDraft(draft), true)
  assert.deepEqual(submission(draft, { visitorId: 'v', sessionId: 's' }).answers, { benefit: 'other' })
  draft.benefit_text = '  다른 이유  '
  assert.equal(validDraft(draft), true)
  assert.equal(submission(draft, { visitorId: 'v', sessionId: 's' }).answers.benefit_text, '다른 이유')
  draft.benefit = 'compare_apps'
  assert.deepEqual(submission(draft, { visitorId: 'v', sessionId: 's' }), {
    visitorId: 'v', sessionId: 's', surveyId: SURVEY_ID, choice: 'not_disappointed', answers: { benefit: 'compare_apps' },
  })
})
test('저장소가 막혀도 설문 동작을 중단하지 않는다', () => {
  const storage = { getItem() { throw new Error() }, setItem() { throw new Error() } }
  assert.equal(terminalState(storage), null)
  assert.doesNotThrow(() => rememberTerminal('answered', storage))
})

test('설문 띄우기는 로컬과 개발 환경에서만 허용한다', () => {
  assert.equal(canPreviewSurvey({ DEV: true }), true)
  assert.equal(canPreviewSurvey({ DEV: false, VITE_APP_ENV: 'development' }), true)
  assert.equal(canPreviewSurvey({ DEV: false, VITE_APP_ENV: 'production' }), false)
  assert.equal(canPreviewSurvey({}), false)
})

test('모든 문항은 선택 전 다음 비활성, 선택 후 활성이다', () => {
  const q = FOLLOW_UP[0]
  assert.equal(canAdvanceQuestion(q, {}), false)
  assert.equal(canAdvanceQuestion(q, { benefit: 'compare_apps' }), true)
  assert.equal(canAdvanceQuestion(q, { benefit: 'other', benefit_text: '  ' }), true)
  assert.equal(canAdvanceQuestion(q, { benefit: 'other' }), true)
  assert.equal(canAdvanceQuestion(q, { benefit: 'other', benefit_text: '직접 작성한 답변' }), true)
})
