// 홈 캐시 키에서 utm_*와 dev를 뗀다. 화면 결과가 같은데 쿼리마다 CDN이 따로 캐시해
// 함수가 그만큼 더 돈다. 브라우저 주소는 그대로라 클라이언트는 dev, utm을 그대로 읽는다.
//
// 메인 화면 A/B(2026-10-05): 쿠키 dk_home=coupon이면 내부 주소 /?__arm=coupon으로 바꿔 서버가 쿠폰 카드로
// 첫 화면을 그리고, CDN도 두 안을 따로 캐시한다. 쿠키는 브라우저가 배정 뒤 적는다(src/homeExperiment.js).
export const config = { matcher: '/' }

export default function middleware(req) {
  const u = new URL(req.url)
  const drop = [...u.searchParams.keys()].filter((k) => k === 'dev' || k.startsWith('utm_') || k === '__arm')
  for (const k of drop) u.searchParams.delete(k)
  const cookie = req.headers.get('cookie') || ''
  const home = u.searchParams.get('home')
  const coupon = home === 'a' || (home !== 'old' && /(?:^|;\s*)dk_home=coupon(?:;|$)/.test(cookie))
  if (coupon) u.searchParams.set('__arm', 'coupon')
  if (drop.length === 0 && !coupon) return
  return new Response(null, { headers: { 'x-middleware-rewrite': u.toString() } })
}
