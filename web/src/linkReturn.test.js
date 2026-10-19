import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_AWAY_MS, noteExit, noteHidden, takeReturn } from './linkReturn.js'

const memory = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

test('누르고 가려졌다 돌아오면 한 번만 보낸다', () => {
  const s = memory()
  noteExit({ brand: 'bhc', platform: 'baemin', where: 'main' }, 1000, s)
  assert.equal(takeReturn(2000, s), null)          // 아직 안 떠났다
  noteHidden(s)
  assert.deepEqual(takeReturn(13000, s), { brand: 'bhc', platform: 'baemin', where: 'main', awayMs: 12000, reloaded: false })
  assert.equal(takeReturn(14000, s), null)         // 두 번 안 보낸다
})

test('같은 탭으로 갔다 새로 열리면 가려짐이 없어도 돌아온 것이다', () => {
  const s = memory()
  noteExit({ brand: 'BBQ', platform: 'coupangeats' }, 0, s)
  assert.equal(takeReturn(5000, s, { reloaded: true }).awayMs, 5000)
})

test('너무 오래 떠나 있었거나 저장소가 깨지면 안 보낸다', () => {
  const s = memory()
  noteExit({ brand: 'a' }, 0, s)
  noteHidden(s)
  assert.equal(takeReturn(MAX_AWAY_MS + 1, s), null)
  s.setItem('dk_last_exit', '{깨짐')
  assert.equal(takeReturn(1, s, { reloaded: true }), null)
  assert.equal(takeReturn(1, null, { reloaded: true }), null)
})
