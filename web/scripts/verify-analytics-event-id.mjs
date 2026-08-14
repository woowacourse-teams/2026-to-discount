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
const { startAnalytics, track } = await import(analyticsUrl.href)
startAnalytics()
for (let i = 0; i < 9; i += 1) track('brand_expand', { brand: String(i) })

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tracked = JSON.parse(fetchBodies[0])
assert.equal(tracked.length, 10)
assert.ok(tracked.every(({ eventId }) => uuidV4.test(eventId)))
assert.equal(new Set(tracked.map(({ eventId }) => eventId)).size, 10)

pagehide()
const beaconBody = await beacon.text()
assert.equal(beaconBody, fetchBodies[1])
const [exit] = JSON.parse(fetchBodies[1])
assert.equal(exit.event, 'page_exit')
assert.ok(uuidV4.test(exit.eventId))

console.log('analytics eventId behavior: PASS')
