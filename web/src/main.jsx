import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { onRecoverableError, startErrorReporting, startWebVitals } from './telemetry.js'
import { setHubLinks } from './offerLink.js'
import {
  setHomeContext,
  disablePostHogFanout,
  registerPostHogSink,
  startAnalyticsDelivery,
} from './analytics.js'
import { startGa4 } from './ga4.js'
import { optedOut } from './privacy.js'
import { markVariantOnRoot } from './variant.js'
import { getAnalyticsContext, isProdHost } from './analytics-context.js'
import { currentHomeArm, saveHomeArm, savedHomeArm } from './homeExperiment.js'
import { initializeShareAttribution } from './shareAttribution.js'
import './App.css'
import { exitGuard, homeUnderDirectLanding } from './backClose.js'
import { showNotice } from './offerLink.js'
import { goLive } from './pageNow.js'

// 홈 카드 A/B(#291): 이번 방문의 안을 첫 이벤트 전에 정한다. 이벤트마다 props.home(+ 강제면 home_forced)로 실린다.
const { arm: homeArm, forced: homeForced, save: homeSave } = currentHomeArm({
  visitorId: getAnalyticsContext().visitorId, prodHost: isProdHost(), search: window.location.search, saved: savedHomeArm(),
})
if (homeSave) saveHomeArm(homeSave)
// index.html 머리가 B로 저장된 방문의 서버 HTML(운영 카드)을 숨겨 뒀다. 그릴 준비가 되면 푼다.
const releaseHomeWait = () => document.documentElement.removeAttribute('data-home-wait')
setHomeContext(homeArm, homeForced)
document.documentElement.dataset.home = homeArm
homeUnderDirectLanding()
exitGuard((text) => showNotice(text, 1600))

function configured(value) {
  return typeof value === 'string' && value.trim() !== ''
}

// 브라우저가 한가할 때(최대 4초). GA4도 쓴다 — 함수 안에만 두었더니 GA4 쪽 load 처리기가 ReferenceError로 죽어 GA4가 안 떴다(2026-10-14).
const later = (fn) => ('requestIdleCallback' in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500))

// 배포 전에 열어 둔 화면이 지워진 옛 청크(FilterSheet, SurveyDock 등)를 부르면 import가 실패해
// 필터 버튼이 아무 반응이 없다(PostHog client_error 7일 8건, 2026-10-17). 한 번만 새로고침해
// 새 index.html을 받는다. 1분 안에 또 실패하면 새로고침하지 않고 오류를 그대로 둔다(무한 새로고침 방지).
window.addEventListener('vite:preloadError', (event) => {
  let last = 0
  try { last = Number(sessionStorage.getItem('dk_chunk_reload')) || 0 } catch { /* 저장소 막힘 */ }
  if (Date.now() - last < 60_000) return
  try { sessionStorage.setItem('dk_chunk_reload', String(Date.now())) } catch { return }
  event.preventDefault()
  window.location.reload()
})

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
initializeShareAttribution()
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
const makeTree = (home) => (
  <React.StrictMode>
    <ErrorBoundary>{home}</ErrorBoundary>
    {/* Vercel 배포 트래픽 집계. /react 엔트리를 쓴다 — Next.js가 아니라
        Vite라 /next는 안 맞는다. 자체 /api/events 수집(analytics.js)과는
        별개로, Vercel 대시보드에서 보는 용도다. DNT/GPC opt-out이면
        컴포넌트를 마운트하지 않아 전송도 하지 않는다. */}
    {!optedOut() && !quiet && <Analytics />}
  </React.StrictMode>
)
if (!ssr || homeArm === 'v2') goLive() // 하이드레이션하지 않는 경로는 처음부터 실시간. 하이드레이션은 App이 마운트된 뒤에 푼다
const tree = makeTree(<App initial={ssr} />)
const rootEl = document.getElementById('root')
// ?home=a면 쿠폰 카드 조각을 하이드레이션 전에 미리 받는다(받는 동안 운영 카드가 보였다가 바뀌는 깜박임과 최대 콘텐츠 표시 시간 손해를 줄인다).
// 첫 렌더에는 영향이 없다(App은 마운트 뒤에 주소를 읽는다).

if (homeArm !== 'v2') releaseHomeWait()
if (homeArm === 'v2') {
  // 시안 카드(B, #291): 서버가 그려 보낸 HTML은 운영 카드라 하이드레이션하지 않고 통째로 새로 그린다. 서버 데이터(initial)는 그대로 넘겨
  // 다시 받지 않는다. 시안 코드와 CSS는 이 갈래에서만 받는다(A에는 시안 CSS가 실리지 않는다). 못 받으면 운영 카드로 그린다.
  // 받는 동안은 숨겨 둔 서버 HTML을 비우고 푼다(운영 카드가 보였다 시안으로 바뀌는 깜박임 방지).
  import('./shells/my-brands-v2/MyBrandsV2Shell.jsx')
    .then(({ default: MyBrandsV2Shell }) => { rootEl.replaceChildren(); releaseHomeWait(); ReactDOM.createRoot(rootEl).render(makeTree(<MyBrandsV2Shell initial={ssr} />)) })
    .catch(() => { rootEl.replaceChildren(); releaseHomeWait(); ReactDOM.createRoot(rootEl).render(tree) })
} else if (ssr) {
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
