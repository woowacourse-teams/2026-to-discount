// 잘못된 정보 제보(2026-10-19 사용자). 상단 바의 알림 종 자리. 알림 켜기는 오퍼 클릭 뒤 팝업(push_prompt)이 맡고,
// 이미 켠 사람이 끌 곳은 이 시트 아래 작은 링크로 둔다(켜져 있을 때만).
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from './analytics.js'
import BrandSuggestions from './BrandSuggestions.jsx'
import { PlatformBadge } from './logos.jsx'
import { PLATFORMS } from './platforms.js'
import { Track, useDragClose } from './sheetParts.jsx'
import { useBrandAutocomplete } from './useBrandAutocomplete.js'
import { getAnalyticsContext } from './analytics-context.js'
import { API_BASE } from './api.js'
import { useBackClose } from './backClose.js'
import { showNotice } from './offerLink.js'
import { needsPlatform, REPORT_TYPES, reportContext, TIP_SEEN_KEY } from './report.js'
import './styles/report.css'

const MAX = 500

function read(key) {
  try { return globalThis.localStorage?.getItem(key) } catch { return null }
}
function write(key) {
  try { globalThis.localStorage?.setItem(key, '1') } catch { /* 못 적으면 다음에 한 번 더 뜬다 */ }
}

export default function ReportButton({ filters, hold, brands }) {
  const [open, setOpen] = useState(false)
  const [tip, setTip] = useState(false)
  const [tipFading, setTipFading] = useState(false)
  const [text, setText] = useState('')
  const [brand, setBrand] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | failed
  const [pushOn, setPushOn] = useState(false)
  useEffect(() => {
    const sync = (e) => setPushOn(Boolean(e.detail))
    window.addEventListener('discount-push-state', sync)
    return () => window.removeEventListener('discount-push-state', sync)
  }, [])
  const canPush = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
  const [type, setType] = useState('')
  const [platform, setPlatform] = useState('')
  const listboxId = useId()
  // 검색창과 같은 자동완성(이름, searchAliases, 초성). 고르면 이름을 넣는다.
  const auto = useBrandAutocomplete({ brands, input: brand, onSelect: (b) => setBrand(b.name) })

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
    // 3초 보이고 0.4초 동안 흐려지며 사라진다. 본 것은 띄울 때 이미 적었다(2026-10-19 사용자)
    const fade = window.setTimeout(() => setTipFading(true), 3000)
    const gone = window.setTimeout(() => { setTip(false); track('report_tip_closed', { reason: 'timeout' }) }, 3400)
    return () => { window.removeEventListener('discount-offer-prompt', hide); window.clearTimeout(fade); window.clearTimeout(gone) }
  }, [tip])

  const close = () => { setOpen(false); if (state !== 'sending') setState('idle') }
  useBackClose(open, close)
  const sheetRef = useRef(null)
  const bodyRef = useRef(null)
  useDragClose(sheetRef, bodyRef, open, close)

  const openSheet = () => {
    if (tip) { setTip(false); track('report_tip_closed', { reason: 'button' }) }
    setPushOn(read('discount-push-enabled') === '1')
    if (state !== 'sending') setState('idle') // 닫힌 뒤 끝난 전송의 결과 문구를 다시 열 때 남기지 않는다
    setOpen(true)
    track('report_open')
  }

  const send = async (e) => {
    e.preventDefault()
    if (!type || !text.trim() || state === 'sending') return
    setState('sending')
    const plat = needsPlatform(type) ? platform : ''
    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, platform: plat, text: text.trim(), brand: brand.trim(), ...reportContext(window.location.href, filters), visitorId: getAnalyticsContext().visitorId }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setState('idle'); setText(''); setBrand(''); setType(''); setPlatform('')
      // 보내면 시트를 닫고 홈 위에 안내를 띄운다(2026-10-19 사용자: 쿠팡이츠 안내처럼)
      setOpen(false)
      showNotice('제보해주셔서 감사합니다.\n빠르게 처리하겠습니다!')
      track('report_sent', { type, platform: plat })
    } catch (err) {
      setState('failed')
      showNotice('전송이 실패했어요.\n다시 시도해 주시겠어요?')
      track('report_failed', { status: String(err?.message ?? '') })
    }
  }

  return (
    <span className="report-btn-wrap">
      <button type="button" className="icon-btn report-btn" aria-label="잘못된 정보 제보" title="제보" aria-expanded={open} onClick={openSheet}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V4h11l-1 4h6v9h-9l1-4H4" /></svg>
      </button>
      {tip && (
        <span className={`report-tip${tipFading ? ' report-tip--out' : ''}`} role="status">
          잘못된 정보가 있으면 제보해주세요!
          <button type="button" className="report-tip__x" aria-label="닫기" onClick={() => { setTip(false); track('report_tip_closed', { reason: 'close_button' }) }}>×</button>
        </span>
      )}
      {open && createPortal(
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) close() }}>
          <form ref={sheetRef} className="sheet report-sheet" role="dialog" aria-modal="true" aria-label="잘못된 정보 제보" onSubmit={send}>
            <div className="sheet__grip" aria-hidden="true" />
            <button type="button" className="sheet__close" aria-label="닫기" onClick={close}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            {/* 알림 켜고 끄기: X 아래 종 아이콘(2026-10-19 사용자). 켜기·끄기는 PushNotificationSetting이 맡는다 */}
            {canPush && (
              <button type="button" className="report-sheet__push" aria-pressed={pushOn}
                      aria-label={pushOn ? '할인 알림 끄기' : '할인 알림 켜기'} title={pushOn ? '할인 알림 끄기' : '할인 알림 켜기'}
                      onClick={() => window.dispatchEvent(new Event('discount-push-toggle'))}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />{!pushOn && <path d="M3 3l18 18" />}
                </svg>
              </button>
            )}
            <h2 className="report-sheet__head">제보</h2>
            <div ref={bodyRef} className="sheet__body report-sheet__body">
            <Track label="제보 종류" thumb>
              {REPORT_TYPES.map((t) => (
                <button type="button" key={t.key} aria-pressed={type === t.key}
                  className={`sheet__chip${type === t.key ? ' sheet__chip--on' : ''}`} onClick={() => setType(t.key)}>{t.label}</button>
              ))}
            </Track>
            {needsPlatform(type) && (
              <div className="sheet__apps page-head__apps" role="group" aria-label="배달앱">
                {PLATFORMS.map((p) => (
                  <span key={p.key} className="platform-badge-wrap">
                    <PlatformBadge platformKey={p.key} active={platform ? platform === p.key : undefined}
                      onClick={() => setPlatform((v) => (v === p.key ? '' : p.key))} />
                  </span>
                ))}
              </div>
            )}
            <div className="report-sheet__brand-wrap">
              <input className="report-sheet__brand" maxLength={100} placeholder="브랜드 (선택)" value={brand}
                role="combobox" aria-autocomplete="list" aria-expanded={auto.isOpen} aria-controls={auto.isOpen ? listboxId : undefined}
                onFocus={auto.open} onBlur={() => auto.close()}
                onChange={(e) => { setBrand(e.target.value); auto.inputChanged() }}
                onKeyDown={(e) => { auto.handleKeyDown(e) }} />
              {auto.isOpen && <BrandSuggestions suggestions={auto.suggestions} activeIndex={auto.activeIndex} listboxId={listboxId} onSelect={auto.select} />}
            </div>
            <textarea className="report-sheet__text" required maxLength={MAX}
              placeholder="제보할 내용을 입력해주세요!" value={text} onChange={(e) => { setText(e.target.value); if (state !== 'sending') setState('idle') }} />
            <div className="report-sheet__count">{text.length}/{MAX}</div>
                    {state === 'failed' && <p className="report-sheet__msg report-sheet__msg--err" role="alert">전송이 실패했어요. 다시 시도해 주시겠어요?</p>}
            <button type="submit" className="report-sheet__send" disabled={!type || !text.trim() || state === 'sending'}>
              {state === 'sending' ? '보내는 중' : '보내기'}
            </button>

            </div>
          </form>
        </div>,
        document.body,
      )}
    </span>
  )
}
