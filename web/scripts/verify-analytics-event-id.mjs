import assert from 'node:assert/strict'

function store() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

Object.defineProperty(globalThis, 'localStorage', { value: store(), configurable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: store(), configurable: true })

let pagehide
let beacon
const fetchBodies = []

Object.defineProperty(globalThis, 'navigator', {
  value: {
    globalPrivacyControl: false,
    doNotTrack: '0',
    sendBeacon: (_, body) => {
      beacon = body
      return false
    },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'window', {
  value: {
    doNotTrack: '0',
    matchMedia: () => ({ matches: true }),
    addEventListener: (name, handler) => {
      if (name === 'pagehide') pagehide = handler
    },
  },
  configurable: true,
})
Object.defineProperty(globalThis, 'document', {
  value: { referrer: '', visibilityState: 'visible', addEventListener: () => {} },
  configurable: true,
})
Object.defineProperty(globalThis, 'location', {
  value: { search: '', host: 'example.test', pathname: '/discounts' },
  configurable: true,
})
globalThis.fetch = async (_, options) => {
  fetchBodies.push(options.body)
  return { ok: true }
}
globalThis.setTimeout = () => 1
globalThis.clearTimeout = () => {}

const analyticsUrl = new URL('../src/analytics.js', import.meta.url)
const {
  disablePostHogFanout,
  enablePostHogFanout,
  registerPostHogSink,
  startAnalyticsDelivery,
  track,
} = await import(analyticsUrl.href)
const sdkEvents = []
let postHogStarted = false
startAnalyticsDelivery({
  postHogConfigured: true,
  startPostHog: () => { postHogStarted = true },
})
assert.equal(postHogStarted, true)
for (let i = 0; i < 9; i += 1) track('brand_expand', { brand: String(i) })

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tracked = JSON.parse(fetchBodies[0])
assert.equal(tracked.length, 10)
assert.ok(tracked.every(({ eventId }) => uuidV4.test(eventId)))
assert.equal(new Set(tracked.map(({ eventId }) => eventId)).size, 10)
assert.equal(sdkEvents.length, 0)
assert.equal(registerPostHogSink((event) => sdkEvents.push(event)), true)
assert.deepEqual(sdkEvents.map(({ eventId }) => eventId), tracked.map(({ eventId }) => eventId))
assert.equal(sdkEvents[0].event, 'page_view')

pagehide()
const beaconBody = await beacon.text()
assert.equal(beaconBody, fetchBodies[1])
const [exit] = JSON.parse(fetchBodies[1])
assert.equal(exit.event, 'page_exit')
assert.ok(uuidV4.test(exit.eventId))
assert.equal(sdkEvents.at(-1).event, 'page_exit')
assert.equal(sdkEvents.at(-1).eventId, exit.eventId)

// SDK가 설정되지 않았거나 초기화에 실패하면 버퍼를 남기지 않는다.
disablePostHogFanout()
enablePostHogFanout()
track('filters_reset')
disablePostHogFanout()
assert.equal(registerPostHogSink(() => {}), false)

// 동적 import가 비정상적으로 오래 걸려도 SDK 대기 큐는 100건을 넘지 않는다.
enablePostHogFanout()
for (let i = 0; i < 101; i += 1) track('membership_toggle', { index: i })
const boundedEvents = []
assert.equal(registerPostHogSink((event) => boundedEvents.push(event)), true)
assert.equal(boundedEvents.length, 100)
assert.equal(boundedEvents[0].props.index, 0)
assert.equal(boundedEvents.at(-1).props.index, 99)

console.log('analytics eventId behavior: PASS')
