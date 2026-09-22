import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getAnalyticsContext } from './analytics-context.js'
import { optedOut } from './privacy.js'
import { declinePrompt, recordPromptVisit } from './pushPrompt.js'
import {
  disablePush,
  enablePush,
  currentSubscription,
  pushAvailability,
  syncPushSubscription,
} from './pushNotifications.js'

export default function PushNotificationSetting() {
  const [availability, setAvailability] = useState(() => pushAvailability())
  const [enabled, setEnabled] = useState(false)
  const [failed, setFailed] = useState(false)
  const [toggleSlot, setToggleSlot] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [feedback, setFeedback] = useState('')
  const changingRef = useRef(false)

  useEffect(() => {
    setToggleSlot(document.getElementById('push-toggle-slot'))
  }, [])

  useEffect(() => {
    if (!feedback) return
    const id = window.setTimeout(() => setFeedback(''), 1000)
    return () => window.clearTimeout(id)
  }, [feedback])

  useEffect(() => {
    if (availability !== 'ready') return
    let active = true
    const { visitorId } = getAnalyticsContext()
    currentSubscription()
      .then((subscription) => {
        if (!active) return
        setEnabled(Boolean(subscription))
        if (!subscription) {
          setShowPrompt(recordPromptVisit())
          return
        }
        syncPushSubscription({
          subscription,
          visitorId,
          analyticsEnabled: !optedOut(),
        }).catch(() => { if (active) setFailed(true) })
      })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [availability])

  async function toggle() {
    if (changingRef.current) return
    changingRef.current = true
    setFailed(false)
    const previous = enabled
    setEnabled(!previous)
    setFeedback(previous ? '할인 알림이 꺼졌습니다' : '할인 알림이 켜졌습니다')
    try {
      if (previous) {
        const result = await disablePush()
        if (!result.localUnsubscribed) {
          setEnabled(true)
          setFailed(true)
          setFeedback('알림을 끄지 못했습니다')
        } else if (!result.serverDeleted) {
          setFailed(true)
          setFeedback('알림 서버 연결에 실패했습니다')
        }
      } else {
        const { visitorId } = getAnalyticsContext()
        const subscribed = await enablePush({ visitorId, analyticsEnabled: !optedOut() })
        if (subscribed) {
          setShowPrompt(false)
        } else {
          setEnabled(false)
          setFeedback('알림이 켜지지 않았습니다')
        }
        if (!subscribed) setAvailability(pushAvailability())
      }
    } catch {
      setEnabled(previous)
      setFailed(true)
      setFeedback('알림 설정을 변경하지 못했습니다')
    } finally {
      changingRef.current = false
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
        onClick={() => {
          if (availability === 'ready') toggle()
          else if (availability === 'ios-install') setFeedback('홈 화면에 추가한 뒤 알림을 켜 주세요')
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
      {showPrompt && availability === 'ready' && !enabled && (
        <section className="push-setting" aria-label="새 할인 알림 안내">
          <button type="button" className="push-setting__close" aria-label="알림 안내 닫기" onClick={() => setShowPrompt(false)}>×</button>
          <p>할인 정보를 빠르게 받아보시겠어요?</p>
          {failed && <p className="push-setting__error" role="status">알림 설정을 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>}
          <div className="push-setting__actions">
            <button type="button" className="push-setting__cta" onClick={toggle}>
              알림 켜기
            </button>
            <button type="button" className="push-setting__decline" onClick={() => {
              declinePrompt()
              setShowPrompt(false)
            }}>아니요, 괜찮아요</button>
          </div>
        </section>
      )}

    </>
  )
}
