import assert from 'node:assert/strict'
import test from 'node:test'
import { createPushSyncRetry, PUSH_SYNC_RETRY_DELAYS } from './pushSyncRetry.js'

async function flush() {
  await new Promise((resolve) => setImmediate(resolve))
}

test('실패한 동기화를 5초, 15초, 60초 순서로 재시도한다', async () => {
  const scheduled = []
  let failures = 0
  const retry = createPushSyncRetry({
    onFailure: () => { failures += 1 },
    setTimeoutValue: (callback, delay) => {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
    clearTimeoutValue: () => {},
  })

  retry.start(async () => { throw new Error('offline') })
  await flush()
  assert.equal(scheduled[0].delay, PUSH_SYNC_RETRY_DELAYS[0])

  scheduled.shift().callback()
  await flush()
  assert.equal(scheduled[0].delay, PUSH_SYNC_RETRY_DELAYS[1])

  scheduled.shift().callback()
  await flush()
  assert.equal(scheduled[0].delay, PUSH_SYNC_RETRY_DELAYS[2])

  scheduled.shift().callback()
  await flush()
  assert.equal(scheduled.length, 0)
  assert.equal(failures, 4)
})

test('온라인 복구 재시도 성공 시 예약 재시도를 중단한다', async () => {
  const scheduled = []
  let shouldFail = true
  let successes = 0
  const retry = createPushSyncRetry({
    onSuccess: () => { successes += 1 },
    setTimeoutValue: (callback, delay) => {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
    clearTimeoutValue: () => {},
  })

  retry.start(async () => {
    if (shouldFail) throw new Error('offline')
  })
  await flush()
  shouldFail = false
  retry.retryNow()
  await flush()

  assert.equal(successes, 1)
})
