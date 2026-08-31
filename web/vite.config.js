import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 배포의 vercel.json rewrites와 같은 규칙을 개발 서버에도 둔다 — 한쪽만
  // 같은 오리진이면 개발에서 못 잡는 CORS 문제가 배포에서만 터진다.
  server: {
    proxy: {
      '/api': {
        target: 'https://bebeggars.duckdns.org',
        changeOrigin: true,
      },
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
