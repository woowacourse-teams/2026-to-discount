import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { markAnswered, markDismissed } from './surveyDismiss.js'
import { PRIMARY, SECTIONS } from './surveyQuestions.js'

const MAX_TEXT = 200
const OTHER = 'other'
const LAST_STEP = SECTIONS.length - 1

// 노출(survey_impression)은 여기서 안 쏜다. 배너를 본 것이 노출이고 이
// 카드는 그것을 연 뒤라, 여기서 쏘면 열어 본 사람만 노출로 세어진다
// (SurveyDock이 쏜다).

function HeaderIcon() {
  return (
    <svg className="survey-header__icon" aria-hidden="true" width="18" height="18"
         viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

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
  // 재고가 없어 코드는 못 받았지만 응답은 갔을 때. code prop과 갈라 둔다 —
  // code는 App이 들고 있어 필터가 바뀌어도 살아남아야 하지만(잃으면 다시
  // 줄 방법이 없다), 이건 잃어도 그만이다(재고가 차면 다시 시도하면 된다).
  const [noStockDone, setNoStockDone] = useState(false)
  const cardRef = useRef(null)

  // 배너를 눌러 이 카드가 그리드에 나타나는 순간 화면이 카드로 와야 한다 —
  // 그리드 맨 앞칸이라 화면 밖(스크롤 위쪽)일 수 있고, 눌렀는데 아무
  // 반응이 없어 보이는 것이 제일 나쁘다. focus까지 옮겨 키보드 사용자도
  // 바로 문항에 닿게 한다.
  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    cardRef.current?.focus({ preventScroll: true })
  }, [])

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
      if (body.ok && body.code) {
        // 답한 사람에게는 다시 안 묻는다. 서버도 원장으로 막지만, 여기서
        // 막아야 화면이 바로 조용해진다.
        markAnswered()
        onCode(body.code)
      } else if (body.ok) {
        // 재고가 없어 코드가 없다(reason: no_stock) — 서버는 이 경우
        // "답했다"로 안 치므로(rewarded=false) 여기서도 markAnswered를
        // 안 부른다. 재고가 차면 다시 열어 받을 수 있어야 한다.
        setNoStockDone(true)
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
      <div className="survey-card" ref={cardRef} tabIndex={-1}>
        <p className="survey-header"><HeaderIcon />어떻게 쓰고 계신가요?</p>
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

  if (noStockDone) {
    return (
      <div className="survey-card" ref={cardRef} tabIndex={-1}>
        <p className="survey-header"><HeaderIcon />어떻게 쓰고 계신가요?</p>
        <div className="survey-body">
          <p className="survey-thanks">답해주셔서 고맙습니다.</p>
          <p className="survey-code-label">지금은 쿠폰이 소진됐어요</p>
          <p className="survey-nostock">쿠폰이 채워지면 여기서 다시 받으실 수 있어요.</p>
          <button type="button" className="survey-close-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    )
  }

  const atLast = step === LAST_STEP
  const canGoNext = SECTIONS[step].id !== PRIMARY.id || Boolean(picked[PRIMARY.id])

  return (
    <div className="survey-card" ref={cardRef} tabIndex={-1}>
      <p className="survey-header"><HeaderIcon />어떻게 쓰고 계신가요?</p>
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

              {/* 자리를 늘 잡아 둔다 — 골랐다 뺐다 할 때마다 카드 높이가
                  바뀌면 바로 아래 진행 막대·버튼이 같이 튀어 시선이
                  흔들린다. display가 아니라 visibility로만 접어서 이
                  섹션이 다른 섹션보다 얕아 보이는 것도 막는다(트랙 안
                  섹션들은 같은 화면 폭을 나눠 쓸 뿐 서로 높이를 맞출
                  이유가 없지만, 이 섹션 자체는 열렸다 닫혔다 해도 자기
                  키를 지켜야 한다). */}
              {s.other && (
                <textarea className="survey-other-input" maxLength={MAX_TEXT} rows={3}
                          aria-label={`${s.title} 직접 입력`}
                          aria-hidden={picked[s.id] !== OTHER}
                          style={{ visibility: picked[s.id] === OTHER ? 'visible' : 'hidden' }}
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
