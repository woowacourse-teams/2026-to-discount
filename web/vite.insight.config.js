// /insight(이슈 #403) 빌드. 홈 빌드 뒤에 같은 dist/로 따로 돈다(npm run build).
// 한 설정에 입력 둘을 두면 React가 공용 조각으로 빠져 홈과 브랜드 페이지의 번들 모양이 바뀐다(브랜드 페이지는
// modulepreload를 안 옮겨 요청이 한 단계 늘어난다). 따로 빌드해 홈 산출물을 그대로 둔다.
// 결과는 dist/insight/index.html이고 /about처럼 폴더 주소로 열린다(vercel.json rewrite 없음).
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config.js'

export default defineConfig((env) => mergeConfig(base(env), {
  build: { emptyOutDir: false, rollupOptions: { input: { insight: 'insight/index.html' } } },
}))
