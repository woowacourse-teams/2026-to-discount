import { useEffect, useState } from 'react'
import { track } from './analytics.js'
import { markDismissed } from './surveyDismiss.js'
import SurveyCard from './SurveyCard.jsx'

// 노출은 한 번만 센다. 이 조각은 필터가 바뀌어도 안 사라지지만(그리드 밖에
// 있다) 라우팅이나 재마운트로 다시 뜰 수 있다 — 한 번 본 것은 한 번이다.
let impressionSent = false

/**
 * 설문을 우측 하단 배너로 먼저 띄우고, 누르면 카드를 편다.
 *
 * 카드를 진입 즉시 그리드에 끼우던 것을 바꿨다. 대상자는 이미 이 서비스를
 * 쓰러 온 사람인데, 첫 화면에서 브랜드 카드 자리를 설문이 차지하면 하려던
 * 일을 막는다. 배너는 자리를 거의 안 뺏고, 누른 사람만 카드를 본다.
 *
 * 그래서 노출과 열람이 갈린다 — survey_impression은 배너를 본 것,
 * survey_open은 열어 본 것이다. 응답률이 낮을 때 "안 보여서"인지 "보고도
 * 안 열어서"인지 이 둘로 갈린다.
 *
 * 그리드 밖(position: fixed)에 둔다. 그리드는 필터가 바뀔 때마다 통째로
 * 새로 마운트되는데(brand-grid의 key), 그 안에 있으면 열어 둔 카드와 받은
 * 번호가 분류 한 번에 날아간다.
 */
export default function SurveyDock({ visitorId, code, onCode, onClose }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (impressionSent) return
    track('survey_impression')
    impressionSent = true
  }, [])

  // 번호를 받으면 접지 않는다 — 접는 순간 번호를 다시 볼 길이 없다.
  useEffect(() => {
    if (code) setOpen(true)
  }, [code])

  if (open) {
    return (
      <div className="survey-dock survey-dock--open">
        <SurveyCard
          visitorId={visitorId}
          code={code}
          onCode={onCode}
          onClose={onClose}
        />
      </div>
    )
  }

  return (
    <div className="survey-dock">
      <button
        type="button"
        className="survey-dock__pill"
        onClick={() => { track('survey_open'); setOpen(true) }}
      >
        <span className="survey-dock__label">어떻게 쓰고 계신가요?</span>
        <span className="survey-dock__hint">답하면 기프티콘</span>
      </button>
      {/* 배너를 닫는 것도 설문을 닫는 것이다 — 카드까지 열어 보지 않아도
          "관심 없다"는 뜻이라 같은 규칙(3일 뒤, 두 번이면 영구)을 건다. */}
      <button
        type="button"
        className="survey-dock__close"
        onClick={() => { markDismissed(); track('survey_dismiss'); onClose() }}
        aria-label="설문 닫기"
      >
        ×
      </button>
    </div>
  )
}
