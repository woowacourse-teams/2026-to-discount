// 홈 SSR 준비. prerender.mjs 다음에 돈다.
//
// 완성된 dist/index.html(자산 태그, SEO 메타 포함)을 함수가 import할 모듈로 옮기고
// dist/index.html은 지운다. 정적 파일이 있으면 Vercel이 "/"를 파일로 내보내 함수까지
// 안 온다(파일이 rewrite보다 먼저다).
import { readFile, writeFile, rm } from 'node:fs/promises'

const src = new URL('../dist/index.html', import.meta.url)
const html = await readFile(src, 'utf8')
await writeFile(new URL('../dist-server/template.js', import.meta.url),
  `export default ${JSON.stringify(html)}\n`)
await rm(src)
console.log('[ssr] template.js 생성, dist/index.html 제거')
