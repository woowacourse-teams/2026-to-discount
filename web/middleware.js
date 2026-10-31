// 홈 캐시 키에서 utm_*, dev, from(유입 경로, #221)을 뗀다. 화면 결과가 같은데 쿼리마다 CDN이 따로 캐시해
// 함수가 그만큼 더 돈다. 브라우저 주소는 그대로라 클라이언트는 dev, utm, from을 그대로 읽는다.
//
// 메인 화면 A/B(2026-10-05 ~ 10-17)는 쿠폰 카드로 끝났고 운영 카드 코드는 지웠다. 실험 때 붙이던 내부 표시
// __arm과 ?home=old는 더 쓰지 않는다. 남은 주소에 붙어 와도 캐시 키에서 뗀다.
export const config = { matcher: '/' }

export default function middleware(req) {
  const u = new URL(req.url)
  const drop = [...u.searchParams.keys()].filter((k) => k === 'dev' || k === 'from' || k.startsWith('utm_') || k === '__arm' || k === 'home')
  if (drop.length === 0) return
  for (const k of drop) u.searchParams.delete(k)
  return new Response(null, { headers: { 'x-middleware-rewrite': u.toString() } })
}
