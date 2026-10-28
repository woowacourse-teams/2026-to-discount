import { useEffect, useState } from 'react'
import { API_BASE, fetchSurveyStatus } from './api.js'
import { getAnalyticsContext } from './analytics-context.js'
import { getStoredCode, markAnswered, shouldShow } from './surveyDismiss.js'

const SURVEY_OPEN = false

export function useSurvey() {
  const [isVisible, setIsVisible] = useState(false)
  const [isCardOpen, setIsCardOpen] = useState(false)
  // App에서 한 번 호출한다. 필터로 카드가 재마운트돼도 발급 코드는 유지한다.
  const [code, setCode] = useState(() => getStoredCode())

  useEffect(() => {
    // 종료는 저장 코드와 개발용 강제 표시보다 우선한다. 저장값은 보존한다.
    if (!SURVEY_OPEN) return

    async function syncCodeFromServer() {
      const { visitorId } = getAnalyticsContext()
      if (!visitorId) return
      try {
        const res = await fetch(`${API_BASE}/api/survey/code?visitorId=${encodeURIComponent(visitorId)}`)
        const body = await res.json()
        if (body.code && body.code !== getStoredCode()) {
          markAnswered(body.code)
          setCode(body.code)
        }
      } catch {
        // 조회 실패 시 기존 저장본을 유지한다.
      }
    }

    // 활성 상태에서는 기존 참여자가 재고와 대상 판정을 거치지 않고 링크를 다시 본다.
    // 서버에서 코드가 바뀌었을 수 있으므로 저장본과 동기화한다.
    if (getStoredCode()) {
      setIsVisible(true)
      syncCodeFromServer()
      return
    }
    // 개발용 화면 확인 경로는 유지하되 설문 종료를 우회하지 못하게 한다.
    if (localStorage.getItem('dk_survey_force') === '1') {
      setIsVisible(true)
      return
    }
    if (!shouldShow()) return
    let alive = true
    const { visitorId } = getAnalyticsContext()
    fetchSurveyStatus(visitorId)
      .then((status) => { if (alive) setIsVisible(Boolean(status.eligible)) })
      .catch(() => {}) // 대상 조회 실패 시 노출하지 않는다.
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
