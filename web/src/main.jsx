import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import {
  disablePostHogFanout,
  registerPostHogSink,
  startAnalyticsDelivery,
} from './analytics.js'
import { startGa4 } from './ga4.js'
import { optedOut } from './privacy.js'
import { markVariantOnRoot } from './variant.js'
import './App.css'

function configured(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function startPostHog() {
  // 실제 SDK는 별도 청크로 늦게 불러온다. 초기 화면의 JavaScript 비용을
  // 키·호스트가 없는 환경과 첫 렌더링에서 늘리지 않는다.
  import('./posthog.js')
    .then(({ initPostHog, captureAnalyticsEvent, capturePostHogConnectionTest }) => {
      if (!initPostHog()) {
        disablePostHogFanout()
        return
      }
      registerPostHogSink(captureAnalyticsEvent)
      capturePostHogConnectionTest()
    })
    .catch((error) => {
      disablePostHogFanout()
      if (import.meta.env.DEV) console.warn('PostHog SDK를 불러오지 못했습니다.', error)
    })
}

const postHogConfigured = (
  !optedOut()
  && configured(import.meta.env.VITE_POSTHOG_KEY)
  && configured(import.meta.env.VITE_POSTHOG_HOST)
)
// 첫 렌더 전에 새긴다 — 뒤에 새기면 A안이 B 스타일로 한 프레임 그려진다.
markVariantOnRoot()
// StrictMode가 컴포넌트를 두 번 마운트하므로 page_view가 두 번 찍히지
// 않도록 React 밖에서 한 번만 시작한다.
startAnalyticsDelivery({ postHogConfigured, startPostHog })
startGa4() // 임시 — ADR-002 참고

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    {/* Vercel 배포 트래픽 집계. /react 엔트리를 쓴다 — Next.js가 아니라
        Vite라 /next는 안 맞는다. 자체 /api/events 수집(analytics.js)과는
        별개로, Vercel 대시보드에서 보는 용도다. DNT/GPC opt-out이면
        컴포넌트를 마운트하지 않아 전송도 하지 않는다. */}
    {!optedOut() && <Analytics />}
  </React.StrictMode>,
)
