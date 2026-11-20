// 홈 카드(#291): 홈 A/B(coupon = 운영 쿠폰 카드 A, v2 = 시안 카드 B)를 2026-11-20에 끝내고 모두 B로 통일했다(docs/metrics/HOME-AB-LOG.md).
// 이벤트에는 여전히 props.home으로 실린다. 주소로 강제: ?home=a(쿠폰 카드), ?home=b 또는 ?home=v2. 강제한 방문은 home_forced=1.
// ponytail: A 코드는 ?home=a 확인용으로 남겼다. 안 쓰게 되면 운영 쿠폰 카드 경로와 함께 지운다.

/** 이번 방문의 안. 브라우저에서만 부른다. { arm: 'coupon' | 'v2', forced } 강제가 없으면 모두 B. */
export function currentHomeArm({ search }) {
  let forced = null
  try {
    const h = new URLSearchParams(search).get('home')
    forced = h === 'a' ? 'coupon' : h === 'v2' || h === 'b' ? 'v2' : null
  } catch { /* 주소를 못 읽으면 B */ }
  if (forced) return { arm: forced, forced: true }
  return { arm: 'v2', forced: false }
}
