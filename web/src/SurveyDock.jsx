import { useEffect } from 'react'
import { track } from './analytics.js'

// 노출은 한 번만 센다. 이 조각은 필터가 바뀌어도 안 사라지지만(그리드 밖에
// 있다) 라우팅이나 재마운트로 다시 뜰 수 있다 — 한 번 본 것은 한 번이다.
let impressionSent = false

/**
 * 우측 하단 트리거 알약. 누르면 App이 그리드 맨 앞칸에 SurveyCard를 연다.
 *
 * 카드 자체는 여기서 안 그린다 — 그리드 안에 놓아 달라는 요청이라, 카드는
 * 그리드가 관리한다(App.jsx). 이 컴포넌트는 "여기 설문 있다"를 알리는
 * 눈에 띄는 문일 뿐이다.
 */
export default function SurveyDock({ open, onOpen }) {
  useEffect(() => {
    if (impressionSent) return
    track('survey_impression')
    impressionSent = true
  }, [])

  if (open) return null

  return (
    <button type="button" className="survey-dock"
            onClick={() => { track('survey_open'); onOpen() }}>
      <span className="survey-dock__badge">쿠폰</span>
      <span className="survey-dock__text">
        <span className="survey-dock__label">어떻게 쓰고 계신가요?</span>
        <span className="survey-dock__hint">답하면 배민 쿠폰 지급</span>
      </span>
    </button>
  )
}
