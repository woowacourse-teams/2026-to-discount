import { useState } from 'react'
import { track } from './analytics.js'
import { markAnswered, markDismissed } from './surveyDismiss.js'
import { PRIMARY, REWARD_NOTICE, SECTIONS } from './surveyQuestions.js'

const MAX_TEXT = 200
const OTHER = 'other'
const LAST_STEP = SECTIONS.length - 1

// 노출(survey_impression)은 여기서 안 쏜다. 배너를 본 것이 노출이고 이
// 카드는 그것을 연 뒤라, 여기서 쏘면 열어 본 사람만 노출로 세어진다
// (SurveyDock이 쏜다).

/**
 * 문항은 surveyQuestions.js에 있다. 이 파일은 그리기와 보내기만 한다 —
 * 물어볼 것을 바꾸는 사람과 화면을 고치는 사람이 같은 파일을 안 건드리게
 * 갈라 둔 것이다.
 *
 * 한 화면에 한 질문. 세 개를 한 번에 늘어놓으면 스크롤이 길어져 몇 문항인지
 * 한눈에 안 잡힌다 — 진행 막대와 넘기기로 하나씩 보여준다.
 *
 * 서버 계약은 첫 섹션 하나만 필수다(choice). 나머지 섹션은 answers 맵으로
 * 딸려 가고, 안 고른 섹션은 아예 안 보낸다 — 셋 다 필수로 만들면 세 번
 * 답해야 기프티콘이 나오는 셈이라 중간에 나가는 사람이 늘어난다.
 */
export default function SurveyCard({ visitorId, code, onCode, onClose }) {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState({})   // 섹션 id -> token
  const [texts, setTexts] = useState({})     // 섹션 id -> 직접 입력
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  function close() {
    // 보내는 중에는 닫지 않는다. 여기서 언마운트되면 서버가 이미 발급한
    // 코드를 보여줄 자리가 사라진다 — 연락처를 안 받으므로 다시 줄 방법이 없다.
    if (sending) return
    markDismissed()
    track('survey_dismiss')
    onClose()
  }

  function pick(sectionId, token) {
    setPicked((prev) => ({ ...prev, [sectionId]: token }))
  }

  async function submit() {
    const primary = picked[PRIMARY.id]
    if (sending || !primary) return
    setSending(true)

    // 첫 섹션은 choice로, 나머지는 answers로 간다. 'other'를 고른 섹션은
    // 적은 글을 같이 실어 보낸다(<id>_text). 서버가 지울 것 지우고 적는다.
    const answers = {}
    for (const s of SECTIONS) {
      const token = picked[s.id]
      if (!token) continue
      if (s.id !== PRIMARY.id) answers[s.id] = token
      if (token === OTHER) {
        const body = (texts[s.id] || '').trim()
        if (body) answers[`${s.id}_text`] = body
      }
    }

    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          choice: primary,
          text: primary === OTHER ? (texts[PRIMARY.id] || '').trim() : undefined,
          answers,
        }),
      })
      const body = await res.json()
      if (body.ok) {
        // 답한 사람에게는 다시 안 묻는다. 서버도 원장으로 막지만, 여기서
        // 막아야 화면이 바로 조용해진다.
        markAnswered()
        onCode(body.code)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  if (code) {
    return (
      <div className="survey-card">
        <p className="survey-header">{REWARD_NOTICE}</p>
        <div className="survey-body">
          <p className="survey-thanks">답해주셔서 고맙습니다.</p>
          <p className="survey-code-label">기프티콘 번호</p>
          {/* 화면에 바로 보여준다 — 연락처를 안 받기로 했으니 이 자리가
              사용자가 번호를 받는 유일한 곳이다. */}
          <p className="survey-code">{code}</p>
          <button type="button" className="survey-close-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )
  }

  const atLast = step === LAST_STEP
  const canGoNext = SECTIONS[step].id !== PRIMARY.id || Boolean(picked[PRIMARY.id])

  return (
    <div className="survey-card">
      <p className="survey-header">{REWARD_NOTICE}</p>
      <button type="button" className="survey-x" onClick={close}
              disabled={sending} aria-label="설문 닫기">×</button>

      <div className="survey-body">
        <div className="survey-progress">
          <span className="survey-progress__count">{step + 1} / {SECTIONS.length}</span>
          <div className="survey-progress__bar">
            <div className="survey-progress__fill"
                 style={{ width: `${((step + 1) / SECTIONS.length) * 100}%` }} />
          </div>
        </div>

        <div className="survey-viewport">
        <div className="survey-track" style={{ transform: `translateX(-${step * 100}%)` }}>
          {SECTIONS.map((s) => (
            <section key={s.id} className="survey-slide">
              <h3 className="survey-q">{s.title}</h3>

              <ul className="survey-choices">
                {s.options.map((o) => (
                  <li key={o.token}>
                    <button type="button" disabled={sending}
                            className={'survey-choice'
                              + (picked[s.id] === o.token ? ' survey-choice--on' : '')}
                            onClick={() => pick(s.id, o.token)}>
                      {o.label}
                    </button>
                  </li>
                ))}
                {s.other && (
                  <li>
                    <button type="button" disabled={sending}
                            className={'survey-choice'
                              + (picked[s.id] === OTHER ? ' survey-choice--on' : '')}
                            onClick={() => pick(s.id, OTHER)}>
                      직접 입력
                    </button>
                  </li>
                )}
              </ul>

              {s.other && picked[s.id] === OTHER && (
                <textarea className="survey-other-input" maxLength={MAX_TEXT} rows={3}
                          aria-label={`${s.title} 직접 입력`}
                          value={texts[s.id] || ''}
                          onChange={(e) => setTexts((p) => ({ ...p, [s.id]: e.target.value }))} />
              )}
            </section>
          ))}
        </div>
        </div>

        <div className="survey-nav">
          <button type="button" className="survey-nav__back" disabled={step === 0 || sending}
                  onClick={() => setStep((s) => s - 1)}>
            이전
          </button>
          {atLast ? (
            <button type="button" className="survey-send"
                    disabled={sending || !picked[PRIMARY.id]} onClick={submit}>
              {sending ? '보내는 중…' : '보내고 쿠폰 받기'}
            </button>
          ) : (
            <button type="button" className="survey-nav__next" disabled={!canGoNext || sending}
                    onClick={() => setStep((s) => s + 1)}>
              다음
            </button>
          )}
        </div>

        {failed && <p className="survey-failed">지금은 참여할 수 없습니다.</p>}
      </div>
    </div>
  )
}
