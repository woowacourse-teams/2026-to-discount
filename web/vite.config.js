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
    },
  },
})
