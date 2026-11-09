import { test } from 'node:test'
import assert from 'node:assert/strict'

const listeners = {}
globalThis.window = { addEventListener: (n, f) => { listeners[n] = f }, removeEventListener: () => {} }
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
  for (const [href, ref, state] of [['https://b.test/', '', null], ['https://b.test/#a', 'https://b.test/', null], ['https://b.test/brand/a', 'https://search.test/', { landed: true }]]) {
    const h = fakeHistory(); h.entries = ['x']; h.state = state
    homeUnderDirectLanding(loc(href), h, ref)
    assert.deepEqual(h.entries, ['x'], href)
  }
})

test('exitGuard: 바닥에 닿은 첫 뒤로는 알리고 칸을 다시 깔고, 2초 안 두 번째는 나간다', async () => {
  const { exitGuard } = await import('./backClose.js')
  const calls = []
  const h = { state: null, pushState: (s) => { h.state = s; calls.push('push') }, back: () => calls.push('back') }
  let t = 0
  const notes = []
  exitGuard((x) => notes.push(x), h, () => t)
  const pop = listeners.popstate
  pop({ state: { guard: true } })        // 위 칸(시트)을 닫은 뒤로: 무시
  assert.deepEqual(notes, [])
  t = 5000; pop({ state: null })         // 바닥: 알림 + 다시 깔기
  assert.equal(notes.length, 1)
  assert.deepEqual(calls, ['push', 'push'])
  t = 6000; pop({ state: null })         // 2초 안 두 번째: 나간다
  assert.equal(calls.at(-1), 'back')
})

test('같은 틱에 닫힌 칸 둘(순위판 + 분류)은 go(-2) 한 번으로 되돌리고, 카드 이동은 popstate 뒤에 한다', async () => {
  const { popOverlays, afterHistorySettles } = await import('./backClose.js')
  const gos = []
  const h = { go: (n) => gos.push(n) }
  const ls = {}
  const target = { addEventListener: (n, f) => { ls[n] = f }, removeEventListener: (n) => { delete ls[n] } }
  const order = []
  popOverlays(h, target)
  popOverlays(h, target)
  afterHistorySettles(() => order.push('scroll'), (f) => f())
  await Promise.resolve()
  assert.deepEqual(gos, [-2])               // back() 두 번이 아니라 이동 한 번
  assert.deepEqual(order, [])               // 이동이 끝나기 전에는 카드로 안 간다
  ls.popstate()
  assert.deepEqual(order, ['scroll'])
  afterHistorySettles(() => order.push('again'), (f) => f())
  assert.deepEqual(order, ['scroll', 'again']) // 이동이 없으면 바로
})

// 칸이 둘 쌓인(분류 + 인기 독) 가짜 창. go(n)이 popstate를 낸다.
function fakeWindow() {
  const fns = new Set()
  const w = { states: [null], fns }
  w.addEventListener = (n, f) => { if (n === 'popstate') fns.add(f) }
  w.removeEventListener = (n, f) => { fns.delete(f) }
  w.history = {
    get state() { return w.states[w.states.length - 1] },
    pushState: (s) => { w.states.push(s) },
    go: (n) => { w.states.length += n; [...fns].forEach((f) => f({})) },
  }
  return w
}
const tick = () => new Promise((r) => setTimeout(r, 0))

test('인기 독을 단추로 접어도 아래 칸(분류)은 닫히지 않는다', async () => {
  const { openLayer } = await import('./backClose.js')
  const w = fakeWindow(); const closed = []
  const offCat = openLayer(() => closed.push('분류'), w)
  const offDock = openLayer(() => closed.push('독'), w)
  offDock() // 단추로 접음 = 쌓았던 칸을 코드가 되돌린다
  await tick()
  assert.deepEqual(closed, [])
  assert.equal(w.states.length, 2) // 독 칸만 빠졌다
  offCat(); await tick()
  assert.equal(w.states.length, 1)
})

test('뒤로 한 번은 맨 위 칸(독)만 닫고, 아래 칸(분류)은 남긴다', async () => {
  const { openLayer } = await import('./backClose.js')
  const w = fakeWindow(); const closed = []
  const offCat = openLayer(() => closed.push('분류'), w)
  let offDock
  offDock = openLayer(() => { closed.push('독'); offDock() }, w)
  w.states.pop(); [...w.fns].forEach((f) => f({})) // 사용자의 뒤로
  await tick()
  assert.deepEqual(closed, ['독'])
  assert.equal(w.states.length, 2) // 분류 칸이 그대로
  offCat()
})
