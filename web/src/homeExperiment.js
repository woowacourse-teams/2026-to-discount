// 메인 화면 A/B: old = 운영 브랜드 카드, coupon = 쿠폰 카드(촘촘한 안, 2026-10-04 고정).
// 2026-10-05 00:00(한국 시각)부터 방문자 ID 해시(FNV-1a)로 반반 배정한다(2026-09 화면 실험과 같은 방식).
// 같은 브라우저는 늘 같은 안을 본다. 이벤트마다 props.home으로 실려 원장과 PostHog에서 가른다.
// 주소로 강제: ?home=a(쿠폰 카드), ?home=old(운영 카드). 강제한 방문은 home_forced=1로 표시해 집계에서 뺀다.
export const HOME_AB_START = Date.parse('2026-10-05T00:00:00+09:00')

function fnv1a(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h
}

export function homeArm(visitorId, now = Date.now()) {
  if (now < HOME_AB_START || !visitorId) return 'old'
  // FNV-1a 아래 비트는 비슷한 ID끼리 쏠린다(실측 2000명 중 883). 한 번 더 섞고(murmur3 마무리) 맨 위 비트로 가른다.
  let h = fnv1a(visitorId)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 31) === 1 ? 'coupon' : 'old'
}

// 브라우저에서만 부른다. 배정 결과를 쿠키(dk_home)에 적어 다음 방문부터 서버가 그 안으로 첫 화면을 그린다
// (web/middleware.js가 쿠키를 보고 캐시 키를 가른다). 강제(?home=)는 적지 않는다.
export const ARM_COOKIE = 'dk_home'
export function currentHomeArm(visitorId) {
  let forced = null
  try { const h = new URLSearchParams(window.location.search).get('home'); forced = h === 'a' ? 'coupon' : h === 'old' ? 'old' : null } catch { /* 주소를 못 읽으면 배정대로 */ }
  // 배정은 쿠키가 정본이다(미들웨어가 첫 방문에 심는다). 쿠키가 없을 때만 방문자 해시로.
  let cookieArm = null
  try { cookieArm = /(?:^|;\s*)dk_home=(coupon|old)(?:;|$)/.exec(document.cookie)?.[1] ?? null } catch { /* 쿠키를 못 읽으면 해시로 */ }
  const arm = forced ?? cookieArm ?? homeArm(visitorId)
  if (!forced && Date.now() >= HOME_AB_START) {
    try { document.cookie = `${ARM_COOKIE}=${arm}; path=/; max-age=31536000; samesite=lax` } catch { /* 쿠키를 못 쓰면 매번 마운트 뒤 바뀐다 */ }
  }
  return { arm, forced: forced != null }
}
