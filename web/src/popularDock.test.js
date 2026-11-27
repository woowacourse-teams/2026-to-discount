// HOT 줄 금액: 소진만 남은 브랜드는 빈칸이 아니라 취소선과 "소진"(#468).
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '..', 'node_modules', '.cache', 'dock-test', 'dock.mjs')
await build({
  entryPoints: [path.join(here, 'PopularDock.jsx')], outfile: out, bundle: true, format: 'esm', platform: 'node',
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' },
})
const { Cells } = await import(pathToFileURL(out).href)

const html = (offers) => renderToStaticMarkup(createElement(Cells, { row: { rank: 1, change: 0, brand: { name: '60계치킨', offers } } }))
const o = { platform: 'baemin', amount: 8000, status: 'confirmed' }

test('소진만 남은 브랜드는 소진 최댓값을 취소선과 소진 라벨로', () => {
  const h = html([{ ...o, soldOut: true }, { ...o, amount: 3000, soldOut: true }])
  assert.match(h, /<s class="offer__amount--soldout">8,000원<\/s><span class="offer__soldout-label">소진<\/span>/)
})

test('남은 오퍼가 있으면 그대로, 소진 표시 없음', () => {
  const h = html([{ ...o, amount: 9000, soldOut: true }, { ...o, amount: 6000 }])
  assert.match(h, /6,000원/)
  assert.doesNotMatch(h, /<s>|<s |소진/)
  // 금액 없는 정률 오퍼가 남아 있어도 소진이 아니다
  assert.doesNotMatch(html([{ ...o, soldOut: true }, { platform: 'baemin', amount: null, rate: 10, status: 'confirmed' }]), /소진/)
})
