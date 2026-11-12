import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importRetry } from './lazyRetry.js'

test('첫 시도가 실패하거나 default가 없으면 한 번 더 시도한다', async () => {
  let n = 0
  const mod = await importRetry(async () => (++n === 1 ? undefined : { default: 'ok' }), 1)
  assert.equal(mod.default, 'ok')
  assert.equal(n, 2)
  let m = 0
  await assert.rejects(importRetry(async () => { m++; throw new Error('offline') }, 1), /offline/)
  assert.equal(m, 2) // 두 번만, 무한 재시도하지 않는다
})
