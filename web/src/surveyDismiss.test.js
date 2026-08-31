import test from 'node:test'
import assert from 'node:assert/strict'

// node:test에는 localStorage가 없다. 규칙만 검사하면 되므로 최소한으로 세운다.
function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  }
}

globalThis.localStorage = fakeStorage()

const { shouldShow, markDismissed, markAnswered } = await import('./surveyDismiss.js')

const DAY = 24 * 60 * 60 * 1000

test('처음에는 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  assert.equal(shouldShow(), true)
})

test('답하면 영구히 안 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  markAnswered()
  assert.equal(shouldShow(), false)
  assert.equal(shouldShow(Date.now() + 365 * DAY), false)
})

test('한 번 닫으면 3일 뒤에 다시 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  const t0 = Date.parse('2026-09-01T00:00:00Z')
  markDismissed(t0)

  assert.equal(shouldShow(t0 + 2 * DAY), false, '이틀 뒤에는 아직')
  assert.equal(shouldShow(t0 + 3 * DAY), true, '사흘 뒤에는 다시')
})

test('두 번 닫으면 영구히 안 띄운다', () => {
  globalThis.localStorage = fakeStorage()
  const t0 = Date.parse('2026-09-01T00:00:00Z')
  markDismissed(t0)
  markDismissed(t0 + 3 * DAY)

  assert.equal(shouldShow(t0 + 100 * DAY), false)
})

test('localStorage가 막혀도 앱이 멈추지 않는다', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('막힘') },
    setItem() { throw new Error('막힘') },
  }
  assert.equal(shouldShow(), true)
  assert.doesNotThrow(() => markDismissed())
})
