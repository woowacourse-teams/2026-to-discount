import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from './analytics.js'
import { getAnalyticsContext } from './analytics-context.js'
import { optedOut } from './privacy.js'
import { hasSeenOfferPrompt, recordOfferPromptSeen } from './pushPrompt.js'
import {
  disablePush,
  deletePushSubscription,
  enablePush,
  currentSubscription,
  pushAvailability,
  syncPushSubscription,
} from './pushNotifications.js'
import { createPushSyncRetry } from './pushSyncRetry.js'

const PUSH_ENABLED_KEY = 'discount-push-enabled'

function storedPushEnabled() {
  try {
    return globalThis.localStorage?.getItem(PUSH_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function storePushEnabled(enabled) {
  try {
    if (enabled) globalThis.localStorage?.setItem(PUSH_ENABLED_KEY, '1')
    else globalThis.localStorage?.removeItem(PUSH_ENABLED_KEY)
  } catch {
    // 저장소가 막혀도 브라우저의 실제 Push 구독 상태를 사용한다.
  }
}

export default function PushNotificationSetting() {
  // 서버(SSR)와 첫 렌더를 맞춘다. 실제 값은 하이드레이션 뒤 effect에서 읽는다.
  const [availability, setAvailability] = useState('unsupported')
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    setAvailability(pushAvailability())
    setEnabled(storedPushEnabled())
  }, [])
  const [failed, setFailed] = useState(false)
  const [toggleSlot, setToggleSlot] = useState(null)
  const [previewPrompt, setPreviewPrompt] = useState(false)
  const [promptSource, setPromptSource] = useState('preview')
  const [changing, setChanging] = useState(false)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [iosGuideClosing, setIosGuideClosing] = useState(false)
  const [feedback, setFeedback] = useState('')
  const changingRef = useRef(false)
  const syncRetryRef = useRef(null)
  const iosGuideCloseTimerRef = useRef(null)
  const offerPromptSeenRef = useRef(false)
  const promptImpressionRef = useRef(false)
  const previousDialogFocusRef = useRef(null)
  const promptDialogRef = useRef(null)
  const iosGuideDialogRef = useRef(null)
  const promptOpen = previewPrompt
  const dialogOpen = promptOpen || showIosGuide

  const closePrompt = useCallback((reason) => {
    if (promptImpressionRef.current) track('push_prompt_closed', { source: promptSource, reason })
    promptImpressionRef.current = false
    setPreviewPrompt(false)
  }, [promptSource])

  useEffect(() => {
    const showOfferPrompt = () => {
      if (enabled || !['ready', 'ios-install'].includes(availability)
          || offerPromptSeenRef.current || hasSeenOfferPrompt()) return
      setPromptSource('offer')
      setPreviewPrompt(true)
    }
    window.addEventListener('discount-offer-prompt', showOfferPrompt)
    return () => window.removeEventListener('discount-offer-prompt', showOfferPrompt)
  }, [enabled, availability])

  useEffect(() => {
    if (!promptOpen) { promptImpressionRef.current = false; return }
    let frame = null
    let active = true
    const recordVisiblePrompt = () => {
      if (!active || promptImpressionRef.current || document.visibilityState !== 'visible' || !document.hasFocus()) return
      if (promptSource === 'offer') {
        if (!recordOfferPromptSeen({ visible: true, focused: true })) return
        offerPromptSeenRef.current = true
      }
      promptImpressionRef.current = true
      track('push_prompt_viewed', { source: promptSource })
    }
    const afterPaint = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(recordVisiblePrompt) })
    }
    afterPaint()
    window.addEventListener('focus', afterPaint)
    document.addEventListener('visibilitychange', afterPaint)
    return () => {
      active = false
      cancelAnimationFrame(frame)
      window.removeEventListener('focus', afterPaint)
      document.removeEventListener('visibilitychange', afterPaint)
    }
  }, [promptOpen, promptSource])

  useEffect(() => {
    if (!promptOpen || showIosGuide) return
    const closeOnEscape = (event) => { if (event.key === 'Escape') closePrompt('escape') }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [promptOpen, showIosGuide, closePrompt])

  useEffect(() => {
    if (!dialogOpen) return
    if (!previousDialogFocusRef.current) previousDialogFocusRef.current = document.activeElement
    const dialog = showIosGuide ? iosGuideDialogRef.current : promptDialogRef.current
    if (!dialog) return
    const focusable = () => [...dialog.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )].filter((element) => element.getClientRects().length > 0)
    const focusFirst = () => {
      const primary = dialog.querySelector('.push-setting__cta:not(:disabled), .ios-push-guide__confirm')
      ;(primary || focusable()[0] || dialog).focus({ preventScroll: true })
    }
    focusFirst()
    const containFocus = (event) => {
      if (!dialog.contains(event.target)) focusFirst()
    }
    const trapTab = (event) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      const current = elements.indexOf(document.activeElement)
      if (!elements.length) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
      } else if (current < 0 || (event.shiftKey && current === 0) || (!event.shiftKey && current === elements.length - 1)) {
        event.preventDefault()
        elements[event.shiftKey ? elements.length - 1 : 0].focus({ preventScroll: true })
      }
    }
    document.addEventListener('focusin', containFocus)
    document.addEventListener('keydown', trapTab)
    return () => {
      document.removeEventListener('focusin', containFocus)
      document.removeEventListener('keydown', trapTab)
    }
  }, [dialogOpen, showIosGuide])

  useEffect(() => {
    if (!dialogOpen) return
    return () => {
      const previousFocus = previousDialogFocusRef.current
      previousDialogFocusRef.current = null
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [dialogOpen])

  useEffect(() => {
    if (!promptOpen && !showIosGuide) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [promptOpen, showIosGuide])

  const closeIosGuide = useCallback(() => {
    if (iosGuideClosing) return
    setIosGuideClosing(true)
    iosGuideCloseTimerRef.current = window.setTimeout(() => {
      setShowIosGuide(false)
      setIosGuideClosing(false)
      iosGuideCloseTimerRef.current = null
    }, 200)
  }, [iosGuideClosing])

  useEffect(() => {
    setToggleSlot(document.getElementById('push-toggle-slot'))
  }, [])

  useEffect(() => {
    if (!feedback || changing || promptOpen) return
    const id = window.setTimeout(() => setFeedback(''), 1000)
    return () => window.clearTimeout(id)
  }, [feedback, changing, promptOpen])

  useEffect(() => {
    if (!showIosGuide) return
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeIosGuide()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeIosGuide, showIosGuide])

  useEffect(() => () => {
    if (iosGuideCloseTimerRef.current) window.clearTimeout(iosGuideCloseTimerRef.current)
  }, [])

  useEffect(() => {
    const retry = createPushSyncRetry({
      onFailure: () => {
        setFailed(true)
        setFeedback('알림 서버 연결에 실패했습니다')
      },
      onSuccess: () => setFailed(false),
    })
    syncRetryRef.current = retry
    const retryOnline = () => retry.retryNow()
    window.addEventListener('online', retryOnline)
    return () => {
      window.removeEventListener('online', retryOnline)
      retry.stop()
      syncRetryRef.current = null
    }
  }, [])

  useEffect(() => {
    if (availability !== 'ready') return
    let active = true
    const { visitorId } = getAnalyticsContext()
    const refreshSubscription = ({ initialize = false } = {}) => currentSubscription()
      .then((subscription) => {
        if (!active) return
        setEnabled(Boolean(subscription))
        storePushEnabled(Boolean(subscription))
        if (!initialize) return
        if (!subscription) {
          return
        }
        syncRetryRef.current?.start(() => syncPushSubscription({
          subscription,
          visitorId,
          analyticsEnabled: !optedOut(),
        }))
      })
      .catch(() => { if (active) setFailed(true) })

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshSubscription()
    }
    const refreshAfterPageShow = () => refreshSubscription()

    refreshSubscription({ initialize: true })
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('pageshow', refreshAfterPageShow)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('pageshow', refreshAfterPageShow)
    }
  }, [availability])

  async function toggle(source) {
    if (changingRef.current) return
    changingRef.current = true
    setChanging(true)
    setFailed(false)
    const previous = enabled
    setFeedback(previous ? '할인 알림을 끄는 중입니다' : '할인 알림을 켜는 중입니다')
    try {
      if (previous) {
        const result = await disablePush()
        if (!result.localUnsubscribed) {
          setEnabled(true)
          storePushEnabled(true)
          setFailed(true)
          setFeedback('알림을 끄지 못했습니다')
        } else {
          setEnabled(false)
          setFeedback('할인 알림이 꺼졌습니다')
          syncRetryRef.current?.stop()
          storePushEnabled(false)
          if (!result.serverDeleted) {
            track('push_subscription_disabled', { source })
            setFailed(true)
            setFeedback('알림 서버 연결에 실패했습니다')
            syncRetryRef.current?.start(() => deletePushSubscription(result.endpoint))
          } else if (result.endpoint) {
            track('push_subscription_disabled', { source })
          }
        }
      } else {
        const { visitorId } = getAnalyticsContext()
        const subscribed = await enablePush({ visitorId, analyticsEnabled: !optedOut() })
        if (subscribed) {
          setEnabled(true)
          setFeedback('할인 알림이 켜졌습니다')
          storePushEnabled(true)
          track('push_subscription_enabled', { source })
        } else {
          setEnabled(false)
          storePushEnabled(false)
          setFeedback('알림이 켜지지 않았습니다')
          setFailed(true)
          if (globalThis.Notification?.permission === 'denied') {
            track('push_permission_denied', { source })
          }
        }
        if (!subscribed) setAvailability(pushAvailability())
      }
    } catch {
      setEnabled(previous)
      storePushEnabled(previous)
      setFailed(true)
      setFeedback('알림 설정을 변경하지 못했습니다')
    } finally {
      changingRef.current = false
      setChanging(false)
    }
  }

  if (availability === 'unsupported') return null

  const toggleControl = (
    <div className="push-settings-control">
      <button
        type="button"
        className={`filter-reset-btn push-settings-btn${enabled ? ' filter-reset-btn--active' : ''}`}
        aria-label={enabled ? '할인 알림 끄기' : '할인 알림 켜기'}
        title={enabled ? '할인 알림 끄기' : '할인 알림 켜기'}
        aria-pressed={enabled}
        disabled={changing}
        onClick={() => {
          if (availability === 'ready') toggle('header')
          else if (availability === 'ios-install') {
            setIosGuideClosing(false)
            setShowIosGuide(true)
          }
          else if (availability === 'denied') setFeedback('브라우저 설정에서 알림을 허용해 주세요')
        }}
      >
        {enabled ? (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a6 6 0 0 0-6 6c0 4.7-1.4 6.5-2.5 7.7A1.4 1.4 0 0 0 4.5 18h15a1.4 1.4 0 0 0 1-2.3C19.4 14.5 18 12.7 18 8a6 6 0 0 0-6-6Zm-2 18a2 2 0 0 0 4 0h-4Z" />
          </svg>
        ) : (
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.7 3.2A6 6 0 0 0 6 8c0 2.5-.4 4.2-1 5.4M18 8c0 4.7 1.4 6.5 2.5 7.7A1.4 1.4 0 0 1 19.5 18H8" />
            <path d="M10 21h4M3 3l18 18" />
          </svg>
        )}
      </button>

      {feedback && <div className="push-settings-feedback" role="status">{feedback}</div>}
    </div>
  )

  return (
    <>
      {toggleSlot && createPortal(toggleControl, toggleSlot)}
      {import.meta.env.DEV && (
        <button
          type="button"
          className="push-prompt-preview-toggle"
          aria-pressed={previewPrompt}
          onClick={() => {
            if (previewPrompt) closePrompt('preview_toggle')
            else { setPromptSource('preview'); setFeedback(''); setPreviewPrompt(true) }
          }}
        >
          알림 안내 {previewPrompt ? '끄기' : '켜기'}
        </button>
      )}
      {promptOpen && (
        <div className="push-setting-preview-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closePrompt('backdrop') }}>
        <section ref={promptDialogRef} className="push-setting push-setting--preview" role="dialog" aria-modal="true" aria-label="새 할인 알림 안내" tabIndex={-1}>
          <button type="button" className="push-setting__close" aria-label="알림 안내 닫기" onClick={() => closePrompt('close_button')}>×</button>
          <p>새로운 배달 할인이 올라오면<br />알림을 보내드릴게요</p>
            <div className="push-notification-example" aria-label="푸시 알림 예시">
              <div className="push-notification-example__sender">
                <img src="/favicon-192.png" width="24" height="24" alt="" />
                <span>배달앱 할인모음</span>
              </div>
              <strong className="push-notification-example__title">BHC 8,000원 할인이 시작되었어요!</strong>
              <p>알림을 눌러 확인하기 {'>'}</p>
            </div>
          {feedback && <p className={failed ? 'push-setting__error' : 'push-setting__status'} role="status">{feedback}</p>}
          {failed && !feedback && <p className="push-setting__error" role="status">알림 설정을 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>}
          <div className="push-setting__actions">
            <button type="button" className="push-setting__cta" disabled={changing || enabled} onClick={() => {
              track('push_prompt_enable_clicked', { source: promptSource })
              if (enabled) {
                setFeedback('이미 알림이 켜져 있습니다')
                setPreviewPrompt(false)
              } else if (availability === 'denied') {
                setFeedback('브라우저 설정에서 알림을 허용해 주세요')
              } else if (availability === 'ios-install') {
                setPreviewPrompt(false)
                setIosGuideClosing(false)
                setShowIosGuide(true)
              } else {
                toggle('prompt')
              }
            }}>
              알림 켜기
            </button>
            <button type="button" className="push-setting__decline" onClick={() => {
              closePrompt('decline_button')
            }}>아니요, 괜찮아요</button>
          </div>
        </section>
        </div>
      )}

      {showIosGuide && createPortal(
        <div
          className={`ios-push-guide-backdrop${iosGuideClosing ? ' ios-push-guide-backdrop--closing' : ''}`}
          role="presentation"
          onClick={closeIosGuide}
        >
          <section
            ref={iosGuideDialogRef}
            tabIndex={-1}
            className={`ios-push-guide${iosGuideClosing ? ' ios-push-guide--closing' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-push-guide-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="ios-push-guide__close"
              aria-label="알림 설정 안내 닫기"
              onClick={closeIosGuide}
            >×</button>
            <h2 id="ios-push-guide-title">할인 알림 받는 방법</h2>

            <ol className="ios-push-guide__steps">
              <li>
                <span className="ios-push-guide__step-number">1</span>
                <span>Safari의 공유 버튼
                  <svg className="ios-push-guide__share" aria-label="공유" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V3" />
                    <path d="m7 8 5-5 5 5" />
                    <path d="M5 12v8h14v-8" />
                  </svg>
                  을 눌러 주세요.
                </span>
              </li>
              <li>
                <span className="ios-push-guide__step-number">2</span>
                <div className="ios-push-guide__step-content">
                  <span><strong>홈 화면에 추가</strong>를 선택해 주세요.</span>
                  <p className="ios-push-guide__note">웹 앱으로 열기 옵션은 ON으로 유지해주세요.</p>
                </div>
              </li>
              <li>
                <span className="ios-push-guide__step-number">3</span>
                <span>추가된 앱을 열고 알림 아이콘을 다시 눌러 주세요.</span>
              </li>
            </ol>
            <button type="button" className="ios-push-guide__confirm" onClick={closeIosGuide}>
              확인
            </button>
          </section>
        </div>,
        document.body,
      )}

    </>
  )
}
