// 홈 캐시 키에서 utm_*와 dev를 뗀다. 화면 결과가 같은데 쿼리마다 CDN이 따로 캐시해
// 함수가 그만큼 더 돈다. 브라우저 주소는 그대로라 클라이언트는 dev, utm을 그대로 읽는다.
//
// 메인 화면: 2026-10-17 A/B를 쿠폰 카드로 결론 냈다. ?home=old가 아니면 내부 주소 /?__arm=coupon으로 바꿔 서버가 쿠폰 카드로
// 첫 화면을 그린다. 쿠키 dk_home은 coupon으로 맞춘다(예전 old 쿠키도 덮는다, src/homeExperiment.js).
export const config = { matcher: '/' }

export default function middleware(req) {
  const u = new URL(req.url)
  const drop = [...u.searchParams.keys()].filter((k) => k === 'dev' || k.startsWith('utm_') || k === '__arm')
  for (const k of drop) u.searchParams.delete(k)
  const cookie = req.headers.get('cookie') || ''
  const home = u.searchParams.get('home')
  const had = /(?:^|;\s*)dk_home=(coupon|old)(?:;|$)/.exec(cookie)?.[1]
  const coupon = home !== 'old'
  if (coupon) u.searchParams.set('__arm', 'coupon')
  const headers = { 'x-middleware-rewrite': u.toString() }
  if (had !== 'coupon' && !home) headers['set-cookie'] = 'dk_home=coupon; Path=/; Max-Age=31536000; SameSite=Lax'
  if (drop.length === 0 && !coupon && !headers['set-cookie']) return
  return new Response(null, { headers })
}
