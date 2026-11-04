import { useEffect, useState } from 'react'
import { API_BASE, fetchSurveyStatus } from './api.js'
import { getAnalyticsContext } from './analytics-context.js'
import { getStoredCode, markAnswered, shouldShow } from './surveyDismiss.js'


export function useSurvey() {
  const [isVisible, setIsVisible] = useState(false)
  const [isCardOpen, setIsCardOpen] = useState(false)
  // App에서 한 번 호출한다. 필터로 카드가 재마운트돼도 발급 코드는 유지한다.
  const [code, setCode] = useState(() => getStoredCode())

  useEffect(() => {
    // 열고 닫기는 서버가 정한다(GET /api/survey 의 open, 서버 환경변수 DISCOUNT_SURVEY_OPEN, 2026-11-04).
    // 닫혀 있으면 저장 코드와 개발용 강제 표시보다 우선해 아무것도 안 띄운다. 저장값은 보존한다.
    let alive = true
    const { visitorId } = getAnalyticsContext()

    async function syncCodeFromServer() {
      if (!visitorId) return
      try {
        const res = await fetch(`${API_BASE}/api/survey/code?visitorId=${encodeURIComponent(visitorId)}`)
        const body = await res.json()
        if (alive && body.code && body.code !== getStoredCode()) {
          markAnswered(body.code)
          setCode(body.code)
        }
      } catch {
        // 조회 실패 시 기존 저장본을 유지한다.
      }
    }

    fetchSurveyStatus(visitorId)
      .then((status) => {
        if (!alive || !status.open) return
        // 열린 동안 기존 참여자는 재고·대상 판정 없이 받은 링크를 다시 본다(서버와 동기화).
        if (getStoredCode()) { setIsVisible(true); syncCodeFromServer(); return }
        if (localStorage.getItem('dk_survey_force') === '1') { setIsVisible(true); return }
        if (!shouldShow()) return
        setIsVisible(Boolean(status.eligible))
      })
      .catch(() => {}) // 조회 실패 시 노출하지 않는다.
    return () => { alive = false }
  }, [])

  function openCard() {
    setIsCardOpen(true)
  }

  function closeCard() {
    setIsCardOpen(false)
    if (!code) setIsVisible(false)
  }

  function dismissDock() {
    setIsVisible(false)
  }

  function receiveCode(issuedCode) {
    setCode(issuedCode)
  }

  return { isVisible, isCardOpen, code, openCard, closeCard, dismissDock, receiveCode }
}
