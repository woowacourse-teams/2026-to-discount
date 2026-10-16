// 메인 화면: 2026-10-05 ~ 2026-10-17 운영 카드(old)와 쿠폰 카드(coupon) 반반 실험을 했고, 2026-10-17 쿠폰 카드로 결론 냈다
// (docs/metrics/HOME-AB-LOG.md). 이제 모두 쿠폰 카드다. 서버 첫 화면은 web/middleware.js가 정한다.
// 이벤트에는 계속 props.home이 실린다. ?home=old(운영 카드, 비교용으로만 남김)와 ?home=a는 home_forced=1로 표시해 집계에서 뺀다.
export function currentHomeArm() {
  let forced = null
  try { const h = new URLSearchParams(window.location.search).get('home'); forced = h === 'a' ? 'coupon' : h === 'old' ? 'old' : null } catch { /* 주소를 못 읽으면 쿠폰 카드 */ }
  return { arm: forced ?? 'coupon', forced: forced != null }
}