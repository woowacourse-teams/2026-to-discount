import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { API_BASE } from './api.js'
import { getAnalyticsContext } from './analytics-context.js'
import { SURVEY_ID, terminalState, rememberTerminal, submission, canPreviewSurvey, surveyArm, inlineSurveyBeforeCard, retryMs, isEligible, awaitingPageView } from './pmfSurvey.js'

async function json(url, options) {
  const res = await fetch(`${API_BASE}/api/survey${url}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error('설문 요청 실패'), { state: body.state })
  return body
}
// 로컬 데모 판정 한 곳(개발 빌드 + ?pmfDemo=1).
const pmfDemo = () => import.meta.env.DEV && new URLSearchParams(location.search).get('pmfDemo') === '1'
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function useSurvey() {
  // 렌더와 무관한 진행 상태. 낱개 ref 열 개를 한 덩어리로 든다.
  const s = useRef({ arm: null, beforeCard: null, assignedArm: null, context: null, inFlight: false, preview: false, finished: false, closeSource: 'inline', viewed: false, source: 'inline' }).current
  const [isVisible, setVisible] = useState(false)
  const [confirmClose, setConfirm] = useState(false)
  const [draft, setDraft] = useState({ choice: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [modalStart, setModalStart] = useState(null)
  const [canFollowUp, setCanFollowUp] = useState(false)
  const [followUpComplete, setFollowUpComplete] = useState(false)
  const interact = useCallback((action, props = {}) => {
    track('survey_interaction', { surveyId: SURVEY_ID, preview: s.preview, surveyArm: s.arm, surveyBeforeCard: s.beforeCard, source: s.source, action, ...props })
  }, [])

  const markViewed = useCallback(displayedAfterCard => {
    if (s.viewed) return
    s.viewed = true
    track('survey_impression', { surveyId: SURVEY_ID, preview: s.preview, surveyArm: s.arm, surveyBeforeCard: s.beforeCard, source: 'inline', displayedAfterCard })
    interact('question_viewed', { question: 'choice', step: 1, displayedAfterCard })
  }, [interact])

  useSurveyCheck(s, interact, setVisible)

  const requestClose = useCallback((source = 'inline') => {
    if (s.inFlight) return
    s.closeSource = source
    interact('close_requested', { source })
    setError('')
    setConfirm(true)
  }, [interact])
  const cancelClose = useCallback(() => { if (!s.inFlight) { interact('close_cancelled', { source: s.closeSource }); setConfirm(false); setError('') } }, [interact])

  async function finish(dismiss, submittedDraft = draft, inline = false) {
    if (s.inFlight || (!s.context && !s.preview) || (s.finished && !s.preview)) return
    if (!dismiss) setCanFollowUp(inline)
    // 개발용 설문도 조작 이벤트를 보내되 실제 응답 원장은 바꾸지 않는다.
    if (s.preview) {
      interact(dismiss ? 'close_confirmed' : 'submit_clicked')
      if (dismiss) track('survey_dismiss', { surveyId: SURVEY_ID, preview: true, source: s.closeSource })
      else interact('preview_completed')
      if (dismiss) s.preview = false
      setVisible(false); setConfirm(false); setModalStart(null); setComplete(!dismiss)
      return
    }
    const demo = pmfDemo()
    if (dismiss) {
      s.finished = true
      if (!demo) rememberTerminal('dismissed')
      setVisible(false)
      setConfirm(false)
      setModalStart(null)
    }
    interact(dismiss ? 'close_confirmed' : 'submit_clicked')
    s.inFlight = true
    setBusy(true); setError('')
    try {
      await json(dismiss ? '/dismiss' : '', post(submission(submittedDraft, s.context)))
      s.finished = true
      if (!demo && !dismiss) rememberTerminal('answered')
      if (dismiss) track('survey_dismiss', { surveyId: SURVEY_ID, preview: false, source: s.closeSource })
      else interact('submit_succeeded', { question: 'choice', step: 1 })
      setVisible(false); setConfirm(false); setModalStart(null)
      setComplete(!dismiss)
    } catch (e) {
      interact(dismiss ? 'dismiss_failed' : 'submit_failed', { reason: e.state || 'request_failed' })
      if (dismiss) return
      if (['answered', 'dismissed', 'closed'].includes(e.state)) {
        s.finished = true
        setVisible(false); setConfirm(false); setModalStart(null)
      } else setError('응답을 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally { s.inFlight = false; setBusy(false) }
  }
  function openFollowUp() {
    s.source = 'followup'
    interact('followup_opened')
    setError('')
    setModalStart(1)
  }

  function closeFollowUp() {
    if (s.inFlight) return
    setModalStart(null)
    setError('')
    s.source = 'inline'
  }

  async function submitFollowUp(answers = draft) {
    if (s.inFlight) return
    if (!answers.benefit && !answers.missing) {
      closeFollowUp()
      return
    }
    interact('followup_submit_clicked')
    s.inFlight = true
    setBusy(true)
    setError('')
    try {
      if (!s.preview) {
        try {
          await json('/follow-up', post(submission(answers, s.context)))
        } catch (e) {
          if (e.state !== 'followup_saved') throw e
        }
      }
      interact('followup_submit_succeeded')
      setModalStart(null)
      setFollowUpComplete(true)
    } catch (e) {
      interact('followup_submit_failed', { reason: e.state || 'request_failed' })
      setError('추가 응답을 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      s.inFlight = false
      setBusy(false)
    }
  }

  function hideComplete() {
    if (s.inFlight) return
    s.preview = false
    setComplete(false)
    setModalStart(null)
    setError('')
  }

  function previewSurvey(previewArm) {
    if (!canPreviewSurvey(import.meta.env) || s.inFlight) return
    s.preview = true
    s.arm = previewArm
    s.beforeCard = previewArm === 'inline' ? inlineSurveyBeforeCard(crypto.randomUUID()) : null
    s.source = previewArm
    setFollowUpComplete(false)
    setDraft({ choice: '' }); setError(''); setComplete(false); setConfirm(false)
    s.viewed = false
    setVisible(true)
  }
  return { previewSurvey, arm: s.arm, beforeCard: s.beforeCard, isPreview: s.preview, markViewed, interact, isVisible, confirmClose, draft, setDraft, busy, error,
    complete, canFollowUp, followUpComplete, openFollowUp, closeFollowUp, hideComplete,
    modalStart, isCardOpen: modalStart !== null,
    openCard: () => {
      if (s.inFlight) return
      s.source = 'dock'
      setError('')
      setModalStart(0)
    },
    submit: modalStart === 1 ? submitFollowUp : answers => finish(false, answers),
    requestClose, cancelClose, dismiss: () => finish(true),
    submitChoice: choice => {
      if (s.inFlight) return
      s.source = 'inline'
      setDraft({ choice })
      return finish(false, { choice }, true)
    } }
}

// 자격 조회와 재시도. 첫 page_view가 원장에 닿기 전 조회는 5, 10, 20, 40초 뒤 다시 본다.
function useSurveyCheck(s, interact, setVisible) {
  useEffect(() => {
    let alive = true, timer, attempts = 0
    const params = new URLSearchParams(location.search)
    const demo = pmfDemo()
    if (demo && params.get('pmfReset') === '1') {
      try { sessionStorage.removeItem('dk_pmf_demo') } catch { /* 새 컨텍스트로 진행 */ }
      params.delete('pmfReset')
      history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`)
    }
    async function check() {
      try {
        if (!s.context) {
          if (demo) {
            // 로컬 프로필에서만 존재하는 API다. 운영의 표시 조건을 우회하지 않는다.
            let cached
            try { cached = JSON.parse(sessionStorage.getItem('dk_pmf_demo')) } catch { /* 새 데모 사용자 */ }
            s.context = cached?.visitorId && cached?.sessionId ? cached : await json('/demo', post({}))
            try { sessionStorage.setItem('dk_pmf_demo', JSON.stringify(s.context)) } catch { /* 메모리로 유지 */ }
          } else s.context = getAnalyticsContext()
        }
        if (!demo && terminalState()) return
        const { visitorId, sessionId } = s.context
        if (!visitorId || !sessionId) return
        const status = await json(`?surveyId=${SURVEY_ID}&visitorId=${encodeURIComponent(visitorId)}&sessionId=${encodeURIComponent(sessionId)}`)
        if (!alive || s.preview || s.finished || s.inFlight) return
        const eligible = isEligible(status)
        if (eligible) {
          const firstAssignment = s.assignedArm === null
          s.assignedArm ??= surveyArm(visitorId)
          s.arm = s.assignedArm
          s.beforeCard = s.arm === 'inline' ? inlineSurveyBeforeCard(visitorId) : null
          if (firstAssignment) {
            s.source = s.arm
            interact('assigned')
          }
        }
        setVisible(eligible)
        if (awaitingPageView(status) && ++attempts < 5) timer = setTimeout(check, retryMs(attempts))
      } catch {
        if (alive && ++attempts < 5) timer = setTimeout(check, retryMs(attempts)) // 429도 여기로 온다. 같은 주기로 다시 두드리지 않는다
      }
    }
    function onVisible() { if (document.visibilityState === 'visible' && !s.inFlight) { clearTimeout(timer); check() } } // attempts는 그대로 둔다. 복귀마다 0으로 돌리면 지수 대기가 풀려 429가 다시 났다
    check()
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [s, interact, setVisible])
}
