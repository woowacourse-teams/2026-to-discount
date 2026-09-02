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
    // 배너에서 열어 보지도 않고 닫은 것과 갈라서 센다(SurveyDock 참고).
    track('survey_dismiss', { source: 'card' })
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
          {/* gifticons.yml에 넣는 값이 코드 문자열일 수도, 링크일 수도
              있다 — 배민 기프티콘은 코드 발급이 까다로워 사람마다 다른
              1회용 링크 쪽이 현실적이다. 어느 쪽이든 이 화면 하나로
              받는다(연락처를 안 받으므로 다시 줄 방법이 없다). */}
          {code.startsWith('http') ? (
            <>
              <p className="survey-code-label">쿠폰 링크</p>
              <a className="survey-code-link" href={code} target="_blank" rel="noreferrer">
                쿠폰 받으러 가기
              </a>
            </>
          ) : (
            <>
              <p className="survey-code-label">기프티콘 번호</p>
              <p className="survey-code">{code}</p>
            </>
          )}
          <button type="button" className="survey-close-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )
  }

  const atLast = step === LAST_STEP
  const canGoNext = SECTIONS[step].id !== PRIMARY.id || Boolean(picked[PRIMARY.id])

  return (
    <div className="survey-card">
      <p className="survey-header">
        {/* 지급 안내 문구 대신 질문 자체를 헤더에 건다 — 배너(닫히기 전
            알약)가 이미 "답하면 배민 쿠폰 지급"을 말하고 열었으니,
            카드 안에서 또 반복할 필요가 없다. 아이콘은 "말 걸고 있다"는
            신호다. */}
        <svg className="survey-header__icon" aria-hidden="true" width="18" height="18"
             viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        어떻게 쓰고 계신가요?
      </p>
      <button type="button" className="survey-x" onClick={close}
              disabled={sending} aria-label="설문 닫기">×</button>

      <div className="survey-body">
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

        <div className="survey-progress">
          <span className="survey-progress__count">{step + 1} / {SECTIONS.length}</span>
          <div className="survey-progress__bar">
            <div className="survey-progress__fill"
                 style={{ width: `${((step + 1) / SECTIONS.length) * 100}%` }} />
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
