import { useEffect } from 'react'
import { track } from './analytics.js'
import { SURVEY_ID } from './pmfSurvey.js'

export default function SurveyDock({ open, onOpen, onDismiss, preview = false }) {
  useEffect(() => { if (!preview) track('survey_impression', { surveyId: SURVEY_ID, source: 'dock' }) }, [preview])
  if (open) return null
  return <div className="survey-dock pmf-dock">
    <button type="button" className="survey-dock__body pmf-dock__open" onClick={() => { if (!preview) track('survey_open', { surveyId: SURVEY_ID, source: 'dock' }); onOpen() }}>
      <span className="survey-dock__label">저희 서비스를 사용해 보니 어떠셨나요?</span>
    </button>
    <button type="button" className="survey-dock__close pmf-dock__close" aria-label="설문 닫기" onClick={onDismiss}>×</button>
  </div>
}
