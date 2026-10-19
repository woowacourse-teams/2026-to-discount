import test from 'node:test'
import assert from 'node:assert/strict'
import { createPostHogDelivery, retryAfterMs } from './posthogDelivery.js'

const event = (id = 'event-1') => ({ event: '$pageview', uuid: id, timestamp: '2026-10-19T00:00:00Z', properties: { distinct_id: 'visitor-1', $insert_id: id } })
const response = (status, text = '', headers = {}) => ({ status, ok: status >= 200 && status < 300, text: async () => text, headers: { get: (key) => headers[key] ?? null } })
function harness(outcomes = []) {
  let clock = 0
  let optedOut = false
  const timers = new Map()
  let id = 0
  const calls = []
  const queue = [...outcomes]
  const delivery = createPostHogDelivery({
    host: 'https://api.example/ph', key: 'phc_test',
    isOptedOut: () => optedOut, now: () => clock, random: () => 0.5,
    setTimer: (fn, delay) => { timers.set(++id, { fn, at: clock + delay }); return id },
    clearTimer: (key) => timers.delete(key),
    fetchRequest: async (...args) => {
      calls.push(args)
      const next = queue.shift() ?? response(200)
      if (next instanceof Error) throw next
      return next
    },
  })
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
  async function advance(ms) {
    const end = clock + ms
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0]
      if (!next || next[1].at > end) break
      clock = next[1].at
      timers.delete(next[0]); next[1].fn(); await settle()
    }
    clock = end
    await settle()
  }
  return { delivery, calls, advance, setOptOut: (v) => { optedOut = v } }
}

test('batch preserves SDK UUID, timestamp and distinct ID; omits credentials', async () => {
  const h = harness()
  const source = event()
  assert.equal(h.delivery.enqueue(source), true)
  source.properties.distinct_id = 'mutated'
  await h.advance(1000)
  assert.equal(h.calls.length, 1)
  const [url, options] = h.calls[0]
  assert.equal(url, 'https://api.example/ph/batch/')
  assert.equal(options.credentials, 'omit')
  assert.equal(options.keepalive, true)
  assert.deepEqual(JSON.parse(options.body), { api_key: 'phc_test', batch: [event()] })
})

test('network and 5xx retry only twice; new events cannot bypass cooldown; one probe restores delivery', async () => {
  const h = harness([new Error('network'), response(503), response(500), response(200)])
  h.delivery.enqueue(event())
  await h.advance(1000)
  await h.advance(4999); assert.equal(h.calls.length, 1)
  await h.advance(1); assert.equal(h.calls.length, 2)
  h.delivery.enqueue(event('second'))
  await h.advance(30_000); assert.equal(h.calls.length, 3)
  assert.equal(h.delivery.enqueue(event('cooldown')), false)
  await h.delivery.flush(); assert.equal(h.calls.length, 3)
  await h.advance(299_999); assert.equal(h.calls.length, 3)
  await h.advance(1); assert.equal(h.calls.length, 4)
  assert.equal(JSON.parse(h.calls[3][1].body).batch.length, 1)
  await h.advance(1000); assert.equal(h.calls.length, 5)
  assert.equal(h.delivery.enqueue(event('restored')), true)
})

test('explicit blocked response skips retries; failed probes wait another five minutes', async () => {
  const h = harness([response(500, '\\*Blocked Request*\\'), response(500), response(200)])
  h.delivery.enqueue(event())
  await h.advance(1000)
  await h.advance(299_999); assert.equal(h.calls.length, 1)
  await h.advance(1); assert.equal(h.calls.length, 2)
  await h.advance(299_999); assert.equal(h.calls.length, 2)
  await h.advance(1)
  // 10분 보관 시간이 지나면 오래된 이벤트를 복구 요청으로 사용하지 않는다.
  assert.equal(h.calls.length, 2)
  h.delivery.enqueue(event('fresh'))
  await h.advance(1000); assert.equal(h.calls.length, 3)
})

test('Retry-After is honored; ordinary 4xx are not retried', async () => {
  const h = harness([response(429, '', { 'Retry-After': '120' }), response(200)])
  h.delivery.enqueue(event()); await h.advance(1000)
  await h.advance(119_999); assert.equal(h.calls.length, 1)
  await h.advance(1); assert.equal(h.calls.length, 2)
  const bad = harness([response(400)])
  bad.delivery.enqueue(event()); await bad.advance(1000)
  await bad.advance(300_000); assert.equal(bad.calls.length, 1)
  assert.equal(retryAfterMs('Wed, 21 Oct 2026 00:00:00 GMT', Date.parse('2026-10-20T00:00:00Z')), 86_400_000)
})

test('queue count, byte size and opt-out bound retained data and requests', async () => {
  const h = harness()
  for (let i = 0; i < 100; i++) assert.equal(h.delivery.enqueue(event(String(i))), true)
  assert.equal(h.delivery.enqueue(event('overflow')), false)
  const huge = event(); huge.properties.large = 'x'.repeat(49 * 1024)
  assert.equal(harness().delivery.enqueue(huge), false)
  await h.advance(1000)
  assert.equal(JSON.parse(h.calls[0][1].body).batch.length, 20)
  h.setOptOut(true)
  await h.advance(60_000); assert.equal(h.calls.length, 1)
  assert.equal(h.delivery.enqueue(event()), false)
})

test('page exit flush cannot bypass a scheduled retry', async () => {
  const h = harness([response(503), response(200)])
  h.delivery.enqueue(event()); await h.advance(1000)
  h.delivery.enqueue({ ...event('exit'), event: 'page_exit' })
  await h.delivery.flush(); assert.equal(h.calls.length, 1)
  await h.advance(5000); assert.equal(h.calls.length, 2)
})
