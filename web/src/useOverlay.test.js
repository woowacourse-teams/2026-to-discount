import test from 'node:test'
import assert from 'node:assert/strict'
import { lockBody } from './useOverlay.js'

test('겹친 잠금은 순서가 엇갈려도 마지막에 처음 값으로 풀린다', () => {
  const s = { overflow: 'auto', paddingRight: '' }
  const a = lockBody(s, 15)
  const b = lockBody(s)
  assert.equal(s.overflow, 'hidden')
  a()
  assert.equal(s.overflow, 'hidden', '하나가 남아 있으면 잠긴 채')
  a()
  b()
  assert.deepEqual(s, { overflow: 'auto', paddingRight: '' })
})

// 특성 테스트(#456): PushNotificationSetting의 Tab 가두기 규칙을 못박는다.
test('포커스 가두기: 끝에서 Tab은 처음으로, 처음에서 Shift+Tab은 끝으로, 칸이 없으면 대화상자', async () => {
  const { trapTabIndex } = await import('./useOverlay.js')
  assert.equal(trapTabIndex(0, -1, false), -1)
  assert.equal(trapTabIndex(3, 2, false), 0)
  assert.equal(trapTabIndex(3, 0, true), 2)
  assert.equal(trapTabIndex(3, -1, false), 0)
  assert.equal(trapTabIndex(3, -1, true), 2)
  assert.equal(trapTabIndex(3, 1, false), null)
  assert.equal(trapTabIndex(3, 1, true), null)
})

test('손가락 리스너: 넷을 붙이고 move만 passive가 아니며, 돌려준 함수가 같은 것을 뗀다', async () => {
  const { addTouch } = await import('./useOverlay.js')
  const on = new Map()
  const el = { addEventListener: (t, f, o) => on.set(t, { f, o }), removeEventListener: (t, f) => { if (on.get(t)?.f === f) on.delete(t) } }
  const h = { start() {}, move() {}, end() {} }
  const off = addTouch(el, h)
  assert.deepEqual([...on.keys()], ['touchstart', 'touchmove', 'touchend', 'touchcancel'])
  assert.deepEqual(on.get('touchstart').o, { passive: true })
  assert.deepEqual(on.get('touchmove').o, { passive: false })
  assert.equal(on.get('touchcancel').f, h.end)
  off()
  assert.equal(on.size, 0)
})
