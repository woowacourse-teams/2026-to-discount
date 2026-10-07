// 홈 SSR 준비. prerender.mjs 다음에 돈다.
//
// 완성된 dist/index.html(자산 태그, SEO 메타 포함)을 함수가 import할 모듈로 옮기고
// dist/index.html은 지운다. 정적 파일이 있으면 Vercel이 "/"를 파일로 내보내 함수까지
// 안 온다(파일이 rewrite보다 먼저다).
import { readFile, writeFile, rm, readdir } from 'node:fs/promises'

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
// 쿠폰 카드 CSS는 지연 로드 조각에 딸려 JS가 돈 뒤에야 받아진다. 그 사이 서버가 그린 쿠폰이 스타일 없이
// 떠서 금액과 '원 할인'이 겹쳤다(2026-10-07 iOS). 쿠폰 쪽 응답에만 링크를 미리 넣도록 주소를 넘긴다.
const couponCss = (await readdir(new URL('../dist/assets/', import.meta.url))).find((f) => /^CouponCard-.*\.css$/.test(f))
if (!couponCss) throw new Error('[ssr] CouponCard CSS를 못 찾았다')
await writeFile(new URL('../dist-server/template.js', import.meta.url),
  `export default ${JSON.stringify(html)}\nexport const couponCss = ${JSON.stringify('/assets/' + couponCss)}\n`)
await rm(src)
console.log('[ssr] template.js 생성, dist/index.html 제거')
