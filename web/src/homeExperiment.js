// 홈 카드 A/B(#291): coupon = 운영 쿠폰 카드(A), v2 = 시안 카드(B, shells/my-brands-v2).
// 방문자 ID 해시(FNV-1a)로 반반 배정한다(2026-10 홈 실험과 같은 방식). 같은 브라우저는 늘 같은 안을 본다.
// 이벤트마다 props.home으로 실려 원장과 PostHog에서 가른다. 주소로 강제: ?home=a(쿠폰 카드), ?home=v2(시안).
// 강제한 방문은 home_forced=1로 표시해 집계에서 뺀다.
//
// 켜는 법: 아래 HOME_V2_START에 시작 시각(Date.parse('2026-..T00:00:00+09:00'))을 넣는다. null이면 운영 주소에서는
// 모두 A다(실수로 일부에게 시안이 나가지 않는다). 운영 주소가 아닌 곳(프리뷰, localhost)은 시안 확인용이라 기본이 B다.
export const HOME_V2_START = null

function fnv1a(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h
}

/** 운영 주소에서 방문자 ID로 정한 안. 시작 전이거나 ID가 없으면 A. */
export function homeArm(visitorId, now = Date.now(), start = HOME_V2_START) {
  if (start == null || now < start || !visitorId) return 'coupon'
  // FNV-1a 아래 비트는 비슷한 ID끼리 쏠린다. 한 번 더 섞고(murmur3 마무리) 맨 위 비트로 가른다.
  let h = fnv1a(visitorId)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16
  return (h >>> 31) === 1 ? 'v2' : 'coupon'
}

/** 이번 방문의 안. 브라우저에서만 부른다. { arm: 'coupon' | 'v2', forced } */
export function currentHomeArm({ visitorId, prodHost, search, now, start }) {
  let forced = null
  try {
    const h = new URLSearchParams(search).get('home')
    forced = h === 'a' ? 'coupon' : h === 'v2' ? 'v2' : null
  } catch { /* 주소를 못 읽으면 배정대로 */ }
  if (forced) return { arm: forced, forced: true }
  if (!prodHost) return { arm: 'v2', forced: false }
  return { arm: homeArm(visitorId, now, start), forced: false }
}
