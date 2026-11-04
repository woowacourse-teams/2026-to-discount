import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { API_BASE } from './api.js'
import { getAnalyticsContext } from './analytics-context.js'
import { SURVEY_ID, terminalState, rememberTerminal, submission, canPreviewSurvey } from './pmfSurvey.js'

async function json(url, options) {
  const res = await fetch(`${API_BASE}/api/survey${url}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error('설문 요청 실패'), { state: body.state })
  return body
}
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function useSurvey() {
  const [isVisible, setVisible] = useState(false)
  const [isCardOpen, setOpen] = useState(false)
  const [confirmClose, setConfirm] = useState(false)
  const [draft, setDraft] = useState({ choice: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [completeClosing, setCompleteClosing] = useState(false)
  const context = useRef(null)
  const inFlight = useRef(false)
  const preview = useRef(false)
  const finished = useRef(false)
  const closeSource = useRef('card')
  const interact = useCallback((action, props = {}) => {
    if (!preview.current) track('survey_interaction', { surveyId: SURVEY_ID, action, ...props })
  }, [])

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
        setVisible(status.surveyId === SURVEY_ID && status.enabled && status.eligible)
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
  }, [])

  useEffect(() => {
    if (!complete) return
    const timer = setTimeout(() => setCompleteClosing(true), 4700)
    return () => clearTimeout(timer)
  }, [complete])
  useEffect(() => {
    if (!completeClosing) return
    const timer = setTimeout(() => { setComplete(false); setCompleteClosing(false) }, 300)
    return () => clearTimeout(timer)
  }, [completeClosing])

  const requestClose = useCallback((source = 'card') => {
    if (inFlight.current) return
    closeSource.current = source
    interact('close_requested', { source })
    setError('')
    setConfirm(true)
  }, [interact])
  const cancelClose = useCallback(() => { if (!inFlight.current) { interact('close_cancelled', { source: closeSource.current }); setConfirm(false); setError('') } }, [interact])

  async function finish(dismiss, submittedDraft = draft) {
    if (inFlight.current || (!context.current && !preview.current)) return
    // 개발용 띄우기는 화면 검토 전용이다. 운영 대상 판정과 응답 원장은 바꾸지 않는다.
    if (preview.current) {
      preview.current = false
      setVisible(false); setOpen(false); setConfirm(false); setCompleteClosing(false); setComplete(!dismiss)
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
      if (dismiss) track('survey_dismiss', { surveyId: SURVEY_ID, source: closeSource.current })
      setVisible(false); setOpen(false); setConfirm(false)
      setCompleteClosing(false); setComplete(!dismiss)
    } catch (e) {
      interact(dismiss ? 'dismiss_failed' : 'submit_failed', { reason: e.state || 'request_failed' })
      if (['answered', 'dismissed', 'closed'].includes(e.state)) {
        finished.current = true
        setVisible(false); setOpen(false); setConfirm(false)
      } else setError(dismiss ? '닫기 상태를 저장하지 못했습니다. 다시 시도해 주세요.' : '응답을 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  function previewSurvey() {
    if (!canPreviewSurvey(import.meta.env) || inFlight.current) return
    preview.current = true
    setDraft({ choice: '' }); setError(''); setComplete(false); setCompleteClosing(false); setConfirm(false)
    setVisible(true); setOpen(false)
  }
  return { previewSurvey, interact, isPreview: preview.current, isVisible, isCardOpen, confirmClose, draft, setDraft, busy, error, complete, completeClosing,
    openCard: () => { setOpen(true); setError('') }, requestClose, cancelClose,
    dismiss: () => finish(true), submit: submittedDraft => finish(false, submittedDraft), clearComplete: () => setCompleteClosing(true) }
}
