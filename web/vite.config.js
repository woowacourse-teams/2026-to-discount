import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveApiBase } from './src/apiBase.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = resolveApiBase(env.VITE_API_BASE_URL, env.VITE_APP_ENV)
  return {
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBase),
      'import.meta.env.VITE_APP_ENV': JSON.stringify(env.VITE_APP_ENV || 'production'),
    },

    plugins: [react(), {
      name: 'api-origin',
      transformIndexHtml: (html) => html.replaceAll('__DISCOUNT_API_BASE__', apiBase),
    }],
    // /api 프록시는 없다. 2026-09-11에 배포의 vercel.json rewrite를 걷어내면서
    // (Edge Requests 절감, api.js 주석 참고) 프론트가 API를 절대주소로 직접
    // 부르게 됐다. 개발 서버에도 프록시를 두면 **개발만 같은 오리진**이 되어
    // CORS 문제를 개발에서 못 잡고 배포에서만 터뜨린다 — 원래 이 프록시를
    // 뒀던 이유가 그것이었으니, 배포가 교차 출처가 된 지금은 개발도 그래야
    // 한다. localhost:5173은 WebConfig의 허용 목록에 있다.
    // PostHog도 실제 API 도메인을 사용해 로컬에서 CORS를 검증한다.
  }
})
