import { test } from 'node:test'
import assert from 'node:assert/strict'

const listeners = {}
globalThis.window = { addEventListener: (n, f) => { listeners[n] = f } }
const { homeUnderDirectLanding } = await import('./backClose.js')

function fakeHistory() {
  const h = { entries: [], state: null }
  h.replaceState = (state, _, url) => { h.entries.splice(-1, 1, url); h.state = state }
  h.pushState = (state, _, url) => { h.entries.push(url); h.state = state }
  return h
}
const loc = (href) => { const u = new URL(href); return { href, origin: u.origin, pathname: u.pathname, hash: u.hash, replaced: null, replace(x) { this.replaced = x } } }

test('밖에서 브랜드 페이지로 바로 오면 밑에 홈 칸을 깔고, 그 칸으로 돌아오면 홈을 연다', () => {
  const h = fakeHistory(); h.entries = ['x']; const l = loc('https://b.test/brand/a')
  homeUnderDirectLanding(l, h, 'https://search.test/')
  assert.deepEqual(h.entries, ['/', 'https://b.test/brand/a'])
  listeners.popstate({ state: { home: true } })
  assert.equal(l.replaced, '/')
})

test('홈, 사이트 안에서 온 하위 화면, 새로고침(state 있음)은 건드리지 않는다', () => {
  for (const [href, ref, state] of [['https://b.test/', '', null], ['https://b.test/#a', 'https://b.test/', null], ['https://b.test/brand/a', '', { home: true }]]) {
    const h = fakeHistory(); h.entries = ['x']; h.state = state
    homeUnderDirectLanding(loc(href), h, ref)
    assert.deepEqual(h.entries, ['x'], href)
  }
})
