import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import { setHubLinks } from './offerLink.js'
import {
  disablePostHogFanout,
  registerPostHogSink,
  startAnalyticsDelivery,
} from './analytics.js'
import { startGa4 } from './ga4.js'
import { optedOut } from './privacy.js'
import { markVariantOnRoot } from './variant.js'
import { getAnalyticsContext } from './analytics-context.js'
import './App.css'

function configured(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function startPostHog() {
  // SDK(압축 85KB)는 페이지 로드가 끝나고 브라우저가 한가할 때 받는다. 그 전 이벤트는
  // analytics.js가 쌓아 뒀다가 넘긴다(pendingPostHogEvents). 2026-09-30 Lighthouse: 첫 화면
  // 동안 SDK를 받아 실행하느라 메인 스레드가 막혔다.
  const later = (fn) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500))
  const go = () => later(loadPostHog)
  if (document.readyState === 'complete') go()
  else window.addEventListener('load', go, { once: true })
}

function loadPostHog() {
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
// GA4는 첫 화면을 그린 뒤에 띄운다. 첫 렌더 전에 동기로 시작해 메인 스레드를 막았다(2026-09-30 Lighthouse).
// 개발 트래픽(?dev=1, 운영 밖 주소)과 측정 도구는 외부 분석(GA4, Vercel Analytics)에도 안 보낸다.
// ?dev=1은 우리 서버가 PostHog로 넘기는 것만 막아, 2026-09-30 성능 측정이 GA4에 그대로 찍혔다.
const quiet = getAnalyticsContext().dev || /Chrome-Lighthouse|HeadlessChrome/.test(navigator.userAgent)
if (!quiet) {
  if (document.readyState === 'complete') setTimeout(startGa4, 0)
  else window.addEventListener('load', () => setTimeout(startGa4, 0), { once: true }) // 임시, ADR-002 참고
}

// 홈은 서버가 요청 시점 데이터로 그린 HTML을 보낸다(api/ssr.js). 그 데이터가 실려 있으면
// 버리지 않고 하이드레이션한다. 없으면(브랜드 페이지, SSR 실패) 예전처럼 통째로 그린다.
const ssr = window.__SSR__
if (ssr) setHubLinks(ssr.banners)
const tree = (
  <React.StrictMode>
    <App initial={ssr} />
    {/* Vercel 배포 트래픽 집계. /react 엔트리를 쓴다 — Next.js가 아니라
        Vite라 /next는 안 맞는다. 자체 /api/events 수집(analytics.js)과는
        별개로, Vercel 대시보드에서 보는 용도다. DNT/GPC opt-out이면
        컴포넌트를 마운트하지 않아 전송도 하지 않는다. */}
    {!optedOut() && !quiet && <Analytics />}
  </React.StrictMode>
)
const rootEl = document.getElementById('root')
if (ssr) ReactDOM.hydrateRoot(rootEl, tree)
else ReactDOM.createRoot(rootEl).render(tree)
