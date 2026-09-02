import { useEffect } from 'react'
import { track } from './analytics.js'
import { markDismissed } from './surveyDismiss.js'

// 노출은 한 번만 센다. 이 조각은 필터가 바뀌어도 안 사라지지만(그리드 밖에
// 있다) 라우팅이나 재마운트로 다시 뜰 수 있다 — 한 번 본 것은 한 번이다.
let impressionSent = false

/**
 * 우측 하단 트리거 알약. 누르면 App이 그리드 맨 앞칸에 SurveyCard를 연다.
 *
 * 카드 자체는 여기서 안 그린다 — 그리드 안에 놓아 달라는 요청이라, 카드는
 * 그리드가 관리한다(App.jsx). 이 컴포넌트는 "여기 설문 있다"를 알리는
 * 눈에 띄는 문일 뿐이다.
 *
 * 닫기는 열어 보지 않고도 할 수 있어야 한다 — 카드를 펴야만 닫을 수 있으면
 * 관심 없는 사람도 매번 열었다 닫아야 한다. 규칙은 카드 안 닫기와 같다
 * (surveyDismiss: 두 번 닫으면 다시 안 뜬다, 그 전엔 3일 쉰다).
 */
export default function SurveyDock({ open, onOpen, onDismiss }) {
  useEffect(() => {
    if (impressionSent) return
    track('survey_impression')
    impressionSent = true
  }, [])

  if (open) return null

  return (
    <div className="survey-dock">
      <button type="button" className="survey-dock__body"
              onClick={() => { track('survey_open'); onOpen() }}>
        <span className="survey-dock__badge">쿠폰</span>
        <span className="survey-dock__text">
          <span className="survey-dock__label">어떻게 쓰고 계신가요?</span>
          <span className="survey-dock__hint">답하면 배민 쿠폰 지급</span>
        </span>
      </button>
      <button type="button" className="survey-dock__close" aria-label="설문 닫기"
              onClick={() => {
                markDismissed()
                // 카드를 열어 본 뒤 닫는 것과 갈라서 센다 — 열어 보지도
                // 않고 닫은 것과 골라 놓고 마음이 바뀐 것은 다른 신호다.
                track('survey_dismiss', { source: 'dock' })
                onDismiss()
              }}>
        ×
      </button>
    </div>
  )
}
