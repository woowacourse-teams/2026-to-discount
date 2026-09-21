import { useEffect, useState } from 'react'
import { getAnalyticsContext } from './analytics-context.js'
import { optedOut } from './privacy.js'
import {
  disablePush,
  enablePush,
  pushAvailability,
  refreshExistingSubscription,
} from './pushNotifications.js'

export default function PushNotificationSetting() {
  const [availability, setAvailability] = useState(() => pushAvailability())
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (availability !== 'ready') return
    let active = true
    const { visitorId } = getAnalyticsContext()
    refreshExistingSubscription({ visitorId, analyticsEnabled: !optedOut() })
      .then((subscribed) => { if (active) setEnabled(subscribed) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [availability])

  async function toggle() {
    setBusy(true)
    setFailed(false)
    try {
      if (enabled) {
        await disablePush()
        setEnabled(false)
      } else {
        const { visitorId } = getAnalyticsContext()
        const subscribed = await enablePush({ visitorId, analyticsEnabled: !optedOut() })
        setEnabled(subscribed)
        if (!subscribed) setAvailability(pushAvailability())
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (availability === 'unsupported') return null

  return (
    <section className="push-setting" aria-labelledby="push-setting-title">
      <div>
        <h2 id="push-setting-title">새 할인 알림</h2>
        {availability === 'ios-install' ? (
          <p>iPhone과 iPad에서는 공유 버튼을 눌러 홈 화면에 추가한 뒤, 설치된 앱에서 알림을 켜 주세요.</p>
        ) : availability === 'denied' ? (
          <p>알림이 차단되어 있습니다. 브라우저 또는 기기 설정에서 이 사이트의 알림을 허용해 주세요.</p>
        ) : (
          <p>{enabled ? '중요한 신규 할인 알림을 받고 있습니다.' : '중요한 신규 할인을 알림으로 받아보세요.'}</p>
        )}
        {failed && <p className="push-setting__error" role="status">알림 설정을 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>}
      </div>
      {availability === 'ready' && (
        <button type="button" onClick={toggle} disabled={busy} aria-pressed={enabled}>
          {busy ? '처리 중' : enabled ? '알림 끄기' : '알림 켜기'}
        </button>
      )}
    </section>
  )
}
