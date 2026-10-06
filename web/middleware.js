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
  // 첫 방문(쿠키 없음)은 여기서 반반 배정해 쿠키를 심는다. 예전엔 서버가 운영 카드로 그리고 화면이 마운트 뒤
  // 배정을 계산해 쿠폰 카드로 통째로 다시 그려, 그 방문의 최대 콘텐츠 표시 시간이 6초대가 됐다(2026-10-06 실측).
  const had = /(?:^|;\s*)dk_home=(coupon|old)(?:;|$)/.exec(cookie)?.[1]
  const assigned = had ?? (Math.random() < 0.5 ? 'coupon' : 'old')
  const coupon = home === 'a' || (home !== 'old' && assigned === 'coupon')
  if (coupon) u.searchParams.set('__arm', 'coupon')
  const headers = { 'x-middleware-rewrite': u.toString() }
  if (!had && !home) headers['set-cookie'] = `dk_home=${assigned}; Path=/; Max-Age=31536000; SameSite=Lax`
  if (drop.length === 0 && !coupon && !headers['set-cookie']) return
  return new Response(null, { headers })
}
