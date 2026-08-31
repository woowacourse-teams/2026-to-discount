import { useEffect, useState } from 'react'
import { track } from './analytics.js'
import { markAnswered, markDismissed } from './surveyDismiss.js'

// 스펙이 정한 네 토큰과 화면 문구. 토큰은 원장에 그대로 들어가므로 바꾸면
// 이전 응답과 못 합친다.
const CHOICES = [
  { token: 'discount_info', label: '할인 정보 보려고' },
  { token: 'save_money', label: '배달비 아끼려고' },
  { token: 'compare', label: '앱끼리 비교하려고' },
]

const MAX_TEXT = 200

// 카드는 필터가 바뀔 때마다 새로 마운트된다. 마운트마다 쏘면 노출 수가 부풀어
// 응답률이 실제보다 낮게 보인다 — 한 번 본 것은 한 번으로 센다.
let impressionSent = false

export default function SurveyCard({ visitorId, code, onCode, onClose }) {
  const [choice, setChoice] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (impressionSent) return
    track('survey_impression')
    impressionSent = true
  }, [])

  function close() {
    // 보내는 중에는 닫지 않는다. 여기서 언마운트되면 서버가 이미 발급한
    // 코드를 보여줄 자리가 사라진다 — 연락처를 안 받으므로 다시 줄 방법이 없다.
    if (sending) return
    markDismissed()
    track('survey_dismiss')
    onClose()
  }

  async function submit(token) {
    if (sending) return
    setSending(true)
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, choice: token, text: token === 'other' ? text.trim() : undefined }),
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
        <p className="survey-thanks">답해주셔서 고맙습니다.</p>
        <p className="survey-code-label">기프티콘 번호</p>
        {/* 화면에 바로 보여준다 — 연락처를 안 받기로 했으니 이 자리가
            사용자가 번호를 받는 유일한 곳이다. */}
        <p className="survey-code">{code}</p>
        <button type="button" className="survey-close-btn" onClick={onClose}>닫기</button>
      </div>
    )
  }

  return (
    <div className="survey-card">
      <button type="button" className="survey-x" onClick={close}
              disabled={sending} aria-label="설문 닫기">×</button>
      <h3 className="survey-q">어떻게 쓰고 계신가요?</h3>

      <ul className="survey-choices">
        {CHOICES.map((c) => (
          <li key={c.token}>
            <button type="button" className="survey-choice" disabled={sending}
                    onClick={() => submit(c.token)}>
              {c.label}
            </button>
          </li>
        ))}
      </ul>

      {choice === 'other' ? (
        <div className="survey-other">
          <label className="survey-other-label" htmlFor="survey-other-input">직접 입력</label>
          <textarea id="survey-other-input" className="survey-other-input"
                    maxLength={MAX_TEXT} rows={3} value={text}
                    onChange={(e) => setText(e.target.value)} />
          <button type="button" className="survey-send" disabled={sending || !text.trim()}
                  onClick={() => submit('other')}>
            보내기
          </button>
        </div>
      ) : (
        <button type="button" className="survey-choice survey-choice--other"
                disabled={sending} onClick={() => setChoice('other')}>
          직접 입력
        </button>
      )}

      {failed && <p className="survey-failed">지금은 참여할 수 없습니다.</p>}
    </div>
  )
}
