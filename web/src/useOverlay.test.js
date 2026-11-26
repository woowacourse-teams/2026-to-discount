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
