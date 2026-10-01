// 홈 캐시 키에서 utm_*와 dev를 뗀다. 화면 결과가 같은데 쿼리마다 CDN이 따로 캐시해
// 함수가 그만큼 더 돈다. 브라우저 주소는 그대로라 클라이언트는 dev, utm을 그대로 읽는다.
export const config = { matcher: '/' }

export default function middleware(req) {
  const u = new URL(req.url)
  const drop = [...u.searchParams.keys()].filter((k) => k === 'dev' || k.startsWith('utm_'))
  if (drop.length === 0) return
  for (const k of drop) u.searchParams.delete(k)
  return new Response(null, { headers: { 'x-middleware-rewrite': u.toString() } })
}
