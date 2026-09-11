import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // /api 프록시는 없다. 2026-09-11에 배포의 vercel.json rewrite를 걷어내면서
  // (Edge Requests 절감, api.js 주석 참고) 프론트가 API를 절대주소로 직접
  // 부르게 됐다. 개발 서버에도 프록시를 두면 **개발만 같은 오리진**이 되어
  // CORS 문제를 개발에서 못 잡고 배포에서만 터뜨린다 — 원래 이 프록시를
  // 뒀던 이유가 그것이었으니, 배포가 교차 출처가 된 지금은 개발도 그래야
  // 한다. localhost:5173은 WebConfig의 허용 목록에 있다.
  server: {
    proxy: {
      // PostHog도 같은 오리진으로 받는다. 리전을 옮겨서 푸는 문제가 아니다 —
      // PostHog 클라우드는 US(버지니아)·EU(프랑크푸르트)뿐이라 한국에서는 EU가
      // 오히려 더 멀다. 프록시를 두면 TLS 핸드셰이크가 서울 엣지에서 끝나고
      // 장거리는 백본이 keep-alive로 처리한다(실측: us.i.posthog.com 직접
      // connect 273ms, 국내 API 43ms).
      //
      // /ph/static·/ph/array는 자산 호스트가 따로다. 순서가 중요하다 —
      // '/ph'가 먼저 걸리면 자산 요청까지 API 호스트로 간다.
      '/ph/static': {
        target: 'https://us-assets.i.posthog.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ph/, ''),
      },
      '/ph/array': {
        target: 'https://us-assets.i.posthog.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ph/, ''),
      },
      '/ph': {
        target: 'https://us.i.posthog.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/ph/, ''),
      },
    },
  },
})
