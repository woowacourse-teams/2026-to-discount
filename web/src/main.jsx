import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { onRecoverableError, startErrorReporting, startWebVitals } from './telemetry.js'
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

// 브라우저가 한가할 때(최대 4초). GA4도 쓴다 — 함수 안에만 두었더니 GA4 쪽 load 처리기가 ReferenceError로 죽어 GA4가 안 떴다(2026-10-14).
const later = (fn) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500))

function startPostHog() {
  // SDK(압축 85KB)는 페이지 로드가 끝나고 브라우저가 한가할 때 받는다. 그 전 이벤트는
  // analytics.js가 쌓아 뒀다가 넘긴다(pendingPostHogEvents). 2026-09-30 Lighthouse: 첫 화면
  // 동안 SDK를 받아 실행하느라 메인 스레드가 막혔다.
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
// 오류는 개발 트래픽에서도 센다(서버가 dev 표시로 가른다). 바이탈은 측정 도구(헤드리스)만 뺀다 — 실험실 값이 섞이면 실사용 분포가 흐려진다.
if (!optedOut()) {
  startErrorReporting()
  if (!/Chrome-Lighthouse|HeadlessChrome/.test(navigator.userAgent)) startWebVitals()
}
if (!quiet) {
  // 2026-10-14: load 직후가 아니라 브라우저가 한가할 때(최대 4초) 띄운다. gtag가 0.45초짜리 긴 작업을 만들었다.
  if (document.readyState === 'complete') later(startGa4)
  else window.addEventListener('load', () => later(startGa4), { once: true }) // 임시, ADR-002 참고
}

// 홈은 서버가 요청 시점 데이터로 그린 HTML을 보낸다(api/ssr.js). 그 데이터가 실려 있으면
// 버리지 않고 하이드레이션한다. 없으면(브랜드 페이지, SSR 실패) 예전처럼 통째로 그린다.
const ssr = window.__SSR__
if (ssr) setHubLinks(ssr.banners)
const tree = (
  <React.StrictMode>
    <ErrorBoundary><App initial={ssr} /></ErrorBoundary>
    {/* Vercel 배포 트래픽 집계. /react 엔트리를 쓴다 — Next.js가 아니라
        Vite라 /next는 안 맞는다. 자체 /api/events 수집(analytics.js)과는
        별개로, Vercel 대시보드에서 보는 용도다. DNT/GPC opt-out이면
        컴포넌트를 마운트하지 않아 전송도 하지 않는다. */}
    {!optedOut() && !quiet && <Analytics />}
  </React.StrictMode>
)
const rootEl = document.getElementById('root')
// ?home=a면 쿠폰 카드 조각을 하이드레이션 전에 미리 받는다(받는 동안 운영 카드가 보였다가 바뀌는 깜박임과 최대 콘텐츠 표시 시간 손해를 줄인다).
// 첫 렌더에는 영향이 없다(App은 마운트 뒤에 주소를 읽는다).

if (ssr) {
  ReactDOM.hydrateRoot(rootEl, tree, { onRecoverableError })
  // iOS WebKit(사파리, 카카오톡 인앱)은 서버가 그린 쿠폰의 컨테이너 단위(cqw) 글자를 처음 한 번 잘못 배치한다.
  // 금액 위에 '원 할인'이 겹치고 최소주문 글자가 사라진 채 남았다(2026-10-07 실기). 다시 그리면 풀리므로
  // 컨테이너를 한 번 껐다 켜 배치를 새로 하게 한다.
  // 2026-10-13 재발(카카오톡 인앱): 글꼴이 하이드레이션 뒤에 도착하면 글자 폭이 다시 어긋났다. 글꼴 도착 뒤에도 한 번 더.
  const relayout = () => {
    const els = rootEl.querySelectorAll('.cc-ticket, .cc--compact, .cc-carousel-wrap, .brand-grid, .cc-sheet__item')
    els.forEach((el) => { el.style.containerType = 'normal' })
    void rootEl.offsetWidth
    els.forEach((el) => { el.style.containerType = '' })
  }
  // 겹침은 iOS WebKit에서만 났다. 다른 기기는 재배치 비용만 남아 건너뛴다(2026-10-14).
  const iosWebKit = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (iosWebKit) {
    requestAnimationFrame(relayout)
    document.fonts?.ready.then(() => requestAnimationFrame(relayout))
    document.fonts?.addEventListener?.('loadingdone', () => requestAnimationFrame(relayout))
  }
}
else ReactDOM.createRoot(rootEl).render(tree)
