// 홈 SSR 준비. prerender.mjs 다음에 돈다.
//
// 완성된 dist/index.html(자산 태그, SEO 메타 포함)을 함수가 import할 모듈로 옮기고
// dist/index.html은 지운다. 정적 파일이 있으면 Vercel이 "/"를 파일로 내보내 함수까지
// 안 온다(파일이 rewrite보다 먼저다).
import { readFile, writeFile, rm } from 'node:fs/promises'

async function replaceAsync(s, re, fn) {
  const parts = await Promise.all([...s.matchAll(re)].map((m) => fn(...m)))
  let i = 0
  return s.replace(re, () => parts[i++])
}

const src = new URL('../dist/index.html', import.meta.url)
let html = await readFile(src, 'utf8')
// 앱 CSS를 HTML에 넣는다. 서버 렌더 HTML은 CSS만 오면 바로 그릴 수 있는데, 따로 받으면
// 왕복 한 번을 더 기다린다. 홈 전용이다(브랜드 페이지는 파일 그대로).
html = await replaceAsync(html, /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
  async (_m, href) => `<style>${await readFile(new URL(`../dist${href}`, import.meta.url), 'utf8')}</style>`)
await writeFile(new URL('../dist-server/template.js', import.meta.url),
  `export default ${JSON.stringify(html)}\n`)
await rm(src)
console.log('[ssr] template.js 생성, dist/index.html 제거')
