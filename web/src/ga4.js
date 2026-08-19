// 임시(2026-07-30): 재방문 측정 정확도 확보를 위해 GA4를 병행 도입한다.
// 자체 analytics.js(localStorage 기반 visitCount)는 localStorage가
// 지워지거나 기기·브라우저가 바뀌면 재방문을 못 잡는다. Vercel Analytics는
// 쿠키를 안 써서 애초에 신규/재방문 구분이 없다. 정확도가 더 급한
// 지금 시점엔 GA4의 신규/재방문 구분이 필요하다는 판단.
//
// 이 도구만 쿠키(_ga)를 쓰고 데이터가 Google로 넘어간다 — 다른 둘과
// 성격이 다르므로 SiteFooter에 그 사실을 그대로 고지한다.
// 제거 조건·전체 맥락은 docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md.
import { optedOut } from './privacy.js'

const MEASUREMENT_ID = 'G-7T4DN0NXV5'

export function startGa4() {
  if (optedOut()) return

  window.dataLayer = window.dataLayer || []
  function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag = gtag

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.appendChild(script)

  gtag('js', new Date())
  // 광고 목적 아님 기조를 최대한 지킨다 — 광고 개인화·Google Signals 끔.
  gtag('config', MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    anonymize_ip: true,
  })
}
