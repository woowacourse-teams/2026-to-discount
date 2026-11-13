// 내 제보 목록 그리기(설계 311). couponCard.test.js처럼 esbuild로 JSX를 묶어 renderToStaticMarkup으로 본다.
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '..', 'node_modules', '.cache', 'chip-test', 'MyReports.mjs')
await build({
  entryPoints: [path.join(here, 'MyReports.jsx')], outfile: out, bundle: true, format: 'esm', platform: 'node',
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
})
const MyReports = (await import(pathToFileURL(out).href)).default
const render = (reports) => renderToStaticMarkup(createElement(MyReports, { reports }))

test('두 줄을 그리고 종류, 브랜드, 날짜, 상태가 있다', () => {
  const html = render([
    { id: 'r_1', at: '2026-11-03T16:00:00Z', type: 'amount', brand: 'BBQ', status: 'reviewing' },
    { id: 'r_2', at: '2026-10-19T05:00:00Z', type: 'other', brand: null, status: 'declined' },
  ])
  assert.equal(html.match(/<li/g).length, 2)
  assert.match(html, /제보 내역/)
  assert.match(html, /할인 금액 · BBQ · 26-11-04/)
  assert.match(html, />확인됨</)
  assert.match(html, />처리됨</)
})

test('빈 목록은 아무것도 그리지 않는다', () => {
  assert.equal(render([]), '')
  assert.equal(render(null), '')
})

test('null 칸은 비고 null 글자가 없다. 모르는 상태는 빈 칸', () => {
  const html = render([{ id: 'r_1', at: '2026-10-19T05:00:00Z', type: null, brand: null, status: 'zzz' }])
  assert.ok(!html.includes('null'))
  assert.match(html, />26-10-19</)
  assert.match(html, /my-reports__status"><\/span>/)
})
