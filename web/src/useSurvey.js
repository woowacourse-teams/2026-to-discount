import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { API_BASE } from './api.js'
import { getAnalyticsContext } from './analytics-context.js'
import { SURVEY_ID, terminalState, rememberTerminal, submission, canPreviewSurvey, surveyArm, inlineSurveyBeforeCard } from './pmfSurvey.js'

async function json(url, options) {
  const res = await fetch(`${API_BASE}/api/survey${url}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error('설문 요청 실패'), { state: body.state })
  return body
}
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function useSurvey() {
  const [isVisible, setVisible] = useState(false)
  const arm = useRef(null)
  const beforeCard = useRef(null)
  const assignedArm = useRef(null)
  const [confirmClose, setConfirm] = useState(false)
  const [draft, setDraft] = useState({ choice: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [modalStart, setModalStart] = useState(null)
  const [canFollowUp, setCanFollowUp] = useState(false)
  const [followUpComplete, setFollowUpComplete] = useState(false)
  const context = useRef(null)
  const inFlight = useRef(false)
  const preview = useRef(false)
  const finished = useRef(false)
  const closeSource = useRef('inline')
  const viewed = useRef(false)
  const source = useRef('inline')
  const interact = useCallback((action, props = {}) => {
    track('survey_interaction', { surveyId: SURVEY_ID, preview: preview.current, surveyArm: arm.current, surveyBeforeCard: beforeCard.current, source: source.current, action, ...props })
  }, [])

  const markViewed = useCallback(displayedAfterCard => {
    if (viewed.current) return
    viewed.current = true
    track('survey_impression', { surveyId: SURVEY_ID, preview: preview.current, surveyArm: arm.current, surveyBeforeCard: beforeCard.current, source: 'inline', displayedAfterCard })
    interact('question_viewed', { question: 'choice', step: 1, displayedAfterCard })
  }, [interact])

  useEffect(() => {
    let alive = true, timer, attempts = 0
    const params = new URLSearchParams(location.search)
    const demo = import.meta.env.DEV && params.get('pmfDemo') === '1'
    if (demo && params.get('pmfReset') === '1') {
      try { sessionStorage.removeItem('dk_pmf_demo') } catch { /* 새 컨텍스트로 진행 */ }
      params.delete('pmfReset')
      history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`)
    }
    async function check() {
      try {
        if (!context.current) {
          if (demo) {
            // 로컬 프로필에서만 존재하는 API다. 운영의 표시 조건을 우회하지 않는다.
            let cached
            try { cached = JSON.parse(sessionStorage.getItem('dk_pmf_demo')) } catch { /* 새 데모 사용자 */ }
            context.current = cached?.visitorId && cached?.sessionId ? cached : await json('/demo', post({}))
            try { sessionStorage.setItem('dk_pmf_demo', JSON.stringify(context.current)) } catch { /* 메모리로 유지 */ }
          } else context.current = getAnalyticsContext()
        }
        if (!demo && terminalState()) return
        const { visitorId, sessionId } = context.current
        if (!visitorId || !sessionId) return
        const status = await json(`?surveyId=${SURVEY_ID}&visitorId=${encodeURIComponent(visitorId)}&sessionId=${encodeURIComponent(sessionId)}`)
        if (!alive || preview.current || finished.current || inFlight.current) return
        const eligible = status.surveyId === SURVEY_ID && status.enabled && status.eligible
        if (eligible) {
          const firstAssignment = assignedArm.current === null
          assignedArm.current ??= surveyArm(visitorId)
          arm.current = assignedArm.current
          beforeCard.current = arm.current === 'inline' ? inlineSurveyBeforeCard(visitorId) : null
          if (firstAssignment) {
            source.current = arm.current
            interact('assigned')
          }
        }
        setVisible(eligible)
        // 첫 page_view가 원장에 도착하기 전의 조회를 최종 탈락으로 보지 않는다.
        if (status.enabled && status.state === 'available' && !status.eligible && ++attempts < 6) timer = setTimeout(check, 5000)
      } catch {
        if (alive && ++attempts < 6) timer = setTimeout(check, 5000)
      }
    }
    function onVisible() { if (document.visibilityState === 'visible' && !inFlight.current) { clearTimeout(timer); attempts = 0; check() } }
    check()
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [interact])

  const requestClose = useCallback((source = 'inline') => {
    if (inFlight.current) return
    closeSource.current = source
    interact('close_requested', { source })
    setError('')
    setConfirm(true)
  }, [interact])
  const cancelClose = useCallback(() => { if (!inFlight.current) { interact('close_cancelled', { source: closeSource.current }); setConfirm(false); setError('') } }, [interact])

  async function finish(dismiss, submittedDraft = draft, inline = false) {
    if (inFlight.current || (!context.current && !preview.current)) return
    if (!dismiss) setCanFollowUp(inline)
    // 개발용 설문도 조작 이벤트를 보내되 실제 응답 원장은 바꾸지 않는다.
    if (preview.current) {
      interact(dismiss ? 'close_confirmed' : 'submit_clicked')
      if (dismiss) track('survey_dismiss', { surveyId: SURVEY_ID, preview: true, source: closeSource.current })
      else interact('preview_completed')
      if (dismiss) preview.current = false
      setVisible(false); setConfirm(false); setModalStart(null); setComplete(!dismiss)
      return
    }
    interact(dismiss ? 'close_confirmed' : 'submit_clicked')
    inFlight.current = true
    setBusy(true); setError('')
    try {
      await json(dismiss ? '/dismiss' : '', post(submission(submittedDraft, context.current)))
      const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('pmfDemo') === '1'
      finished.current = true
      if (!demo) rememberTerminal(dismiss ? 'dismissed' : 'answered')
      if (dismiss) track('survey_dismiss', { surveyId: SURVEY_ID, preview: false, source: closeSource.current })
      else interact('submit_succeeded', { question: 'choice', step: 1 })
      setVisible(false); setConfirm(false); setModalStart(null)
      setComplete(!dismiss)
    } catch (e) {
      interact(dismiss ? 'dismiss_failed' : 'submit_failed', { reason: e.state || 'request_failed' })
      if (['answered', 'dismissed', 'closed'].includes(e.state)) {
        finished.current = true
        setVisible(false); setConfirm(false); setModalStart(null)
      } else setError(dismiss ? '닫기 상태를 저장하지 못했습니다. 다시 시도해 주세요.' : '응답을 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  function openFollowUp() {
    source.current = 'followup'
    interact('followup_opened')
    setError('')
    setModalStart(1)
  }

  function closeFollowUp() {
    if (inFlight.current) return
    setModalStart(null)
    setError('')
    source.current = 'inline'
  }

  async function submitFollowUp(answers = draft) {
    if (inFlight.current) return
    if (!answers.benefit && !answers.missing) {
      closeFollowUp()
      return
    }
    interact('followup_submit_clicked')
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      if (!preview.current) {
        try {
          await json('/follow-up', post(submission(answers, context.current)))
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
      inFlight.current = false
      setBusy(false)
    }
  }

  function hideComplete() {
    if (inFlight.current) return
    preview.current = false
    setComplete(false)
    setModalStart(null)
    setError('')
  }

  function previewSurvey(previewArm) {
    if (!canPreviewSurvey(import.meta.env) || inFlight.current) return
    preview.current = true
    arm.current = previewArm
    beforeCard.current = previewArm === 'inline' ? inlineSurveyBeforeCard(crypto.randomUUID()) : null
    source.current = previewArm
    setFollowUpComplete(false)
    setDraft({ choice: '' }); setError(''); setComplete(false); setConfirm(false)
    viewed.current = false
    setVisible(true)
  }
  return { previewSurvey, arm: arm.current, beforeCard: beforeCard.current, isPreview: preview.current, markViewed, interact, isVisible, confirmClose, draft, setDraft, busy, error,
    complete, canFollowUp, followUpComplete, openFollowUp, closeFollowUp, hideComplete,
    modalStart, isCardOpen: modalStart !== null,
    openCard: () => {
      if (inFlight.current) return
      source.current = 'dock'
      setError('')
      setModalStart(0)
    },
    submit: modalStart === 1 ? submitFollowUp : answers => finish(false, answers),
    requestClose, cancelClose, dismiss: () => finish(true),
    submitChoice: choice => {
      if (inFlight.current) return
      source.current = 'inline'
      setDraft({ choice })
      return finish(false, { choice }, true)
    } }
}
