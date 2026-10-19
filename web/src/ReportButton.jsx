// 잘못된 정보 제보(2026-10-19 사용자). 상단 바의 알림 종 자리. 알림 켜기는 오퍼 클릭 뒤 팝업(push_prompt)이 맡고,
// 이미 켠 사람이 끌 곳은 이 시트 아래 작은 링크로 둔다(켜져 있을 때만).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from './analytics.js'
import { getAnalyticsContext } from './analytics-context.js'
import { API_BASE } from './api.js'
import { useBackClose } from './backClose.js'
import { reportContext, TIP_SEEN_KEY } from './report.js'
import './styles/report.css'

const MAX = 500

function read(key) {
  try { return globalThis.localStorage?.getItem(key) } catch { return null }
}
function write(key) {
  try { globalThis.localStorage?.setItem(key, '1') } catch { /* 못 적으면 다음에 한 번 더 뜬다 */ }
}

export default function ReportButton({ filters, hold }) {
  const [open, setOpen] = useState(false)
  const [tip, setTip] = useState(false)
  const [text, setText] = useState('')
  const [brand, setBrand] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | failed
  const [pushOn, setPushOn] = useState(false)

  // 말풍선: 첫 방문 안내(?guide=1)가 떠 있으면 기다린다. 알림 팝업이 뜨면 걷는다.
  useEffect(() => {
    if (hold || read(TIP_SEEN_KEY)) return undefined
    const id = window.setTimeout(() => { setTip(true); write(TIP_SEEN_KEY); track('report_tip_shown') }, 1200)
    return () => window.clearTimeout(id)
  }, [hold])
  useEffect(() => {
    if (!tip) return undefined
    const hide = () => setTip(false)
    window.addEventListener('discount-offer-prompt', hide)
    return () => window.removeEventListener('discount-offer-prompt', hide)
  }, [tip])

  const close = () => { setOpen(false); if (state !== 'sending') setState('idle') }
  useBackClose(open, close)

  const openSheet = () => {
    if (tip) { setTip(false); track('report_tip_closed', { reason: 'button' }) }
    setPushOn(read('discount-push-enabled') === '1')
    setOpen(true)
    track('report_open')
  }

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim() || state === 'sending') return
    setState('sending')
    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), brand: brand.trim(), ...reportContext(window.location.href, filters), visitorId: getAnalyticsContext().visitorId }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setState('sent'); setText(''); setBrand('')
      track('report_sent')
    } catch (err) {
      setState('failed')
      track('report_failed', { status: String(err?.message ?? '') })
    }
  }

  return (
    <span className="report-btn-wrap">
      <button type="button" className="icon-btn report-btn" aria-label="잘못된 정보 제보" title="제보" aria-expanded={open} onClick={openSheet}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4h11l-1 4h6v9h-9l1-4H4" /></svg>
      </button>
      {tip && (
        <span className="report-tip" role="status">
          잘못된 정보가 있으면 제보해주세요!
          <button type="button" className="report-tip__x" aria-label="닫기" onClick={() => { setTip(false); track('report_tip_closed', { reason: 'close_button' }) }}>×</button>
        </span>
      )}
      {open && createPortal(
        <div className="report-dim" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
          <form className="report-sheet" role="dialog" aria-modal="true" aria-label="잘못된 정보 제보" onSubmit={send}>
            <div className="report-sheet__head">
              <strong>잘못된 정보 제보</strong>
              <button type="button" className="report-sheet__x" aria-label="닫기" onClick={close}>×</button>
            </div>
            <textarea className="report-sheet__text" required maxLength={MAX} rows={4} autoFocus
              placeholder="잘못된 내용" value={text} onChange={(e) => { setText(e.target.value); if (state !== 'sending') setState('idle') }} />
            <div className="report-sheet__count">{text.length}/{MAX}</div>
            <input className="report-sheet__brand" maxLength={100} placeholder="브랜드 (선택)" value={brand} onChange={(e) => setBrand(e.target.value)} />
            {state === 'sent' && <p className="report-sheet__msg" role="status">제보 완료</p>}
            {state === 'failed' && <p className="report-sheet__msg report-sheet__msg--err" role="status">전송 실패, 다시 시도</p>}
            <button type="submit" className="report-sheet__send" disabled={!text.trim() || state === 'sending'}>
              {state === 'sending' ? '보내는 중' : '보내기'}
            </button>
            {pushOn && (
              <button type="button" className="report-sheet__push-off" onClick={() => {
                window.dispatchEvent(new Event('discount-push-disable')); setPushOn(false); close()
              }}>할인 알림 끄기</button>
            )}
          </form>
        </div>,
        document.body,
      )}
    </span>
  )
}
