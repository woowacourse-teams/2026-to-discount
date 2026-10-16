// 메인 화면 A/B: old = 운영 브랜드 카드, coupon = 쿠폰 카드(촘촘한 안, 2026-10-04 고정).
// 2026-10-05 00:00 ~ 2026-10-17 반반 배정으로 실험했고, 2026-10-17 쿠폰 카드로 결론 냈다(docs/metrics/HOME-AB-LOG.md).
// 이제 모두 쿠폰 카드다. 이벤트에는 계속 props.home이 실린다.
// 주소로 강제: ?home=a(쿠폰 카드), ?home=old(운영 카드, 비교용으로만 남김). 강제한 방문은 home_forced=1로 표시해 집계에서 뺀다.
// 브라우저에서만 부른다. 결과를 쿠키(dk_home)에 적어 다음 방문부터 서버가 그 안으로 첫 화면을 그린다
// (web/middleware.js가 쿠키를 보고 캐시 키를 가른다). 강제(?home=)는 적지 않는다.
export const ARM_COOKIE = 'dk_home'
export function currentHomeArm() {
  let forced = null
  try { const h = new URLSearchParams(window.location.search).get('home'); forced = h === 'a' ? 'coupon' : h === 'old' ? 'old' : null } catch { /* 주소를 못 읽으면 배정대로 */ }
  // ponytail: 실험 종료로 배정은 늘 쿠폰 카드. 예전 old 쿠키도 덮어쓴다.
  const arm = forced ?? 'coupon'
  if (!forced) {
    try { document.cookie = `${ARM_COOKIE}=${arm}; path=/; max-age=31536000; samesite=lax` } catch { /* 쿠키를 못 쓰면 매번 마운트 뒤 바뀐다 */ }
  }
  return { arm, forced: forced != null }
}
