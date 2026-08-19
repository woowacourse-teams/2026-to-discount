import assert from 'node:assert/strict'
import {
  POSTHOG_CONNECTION_TEST_EVENT,
  createPostHogAdapter,
} from '../src/posthog.js'

function memoryStore() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

function fakeClient() {
  const calls = { init: [], capture: [] }
  return {
    calls,
    init: (...args) => calls.init.push(args),
    capture: (...args) => calls.capture.push(args),
  }
}

const context = {
  visitorId: 'v_0123456789abcdef',
  sessionId: 's_0123456789abcdef',
  visitCount: 3,
  dev: true,
}

function adapter(overrides = {}) {
  const client = overrides.client ?? fakeClient()
  const sessionStore = overrides.sessionStore ?? memoryStore()
  return {
    client,
    instance: createPostHogAdapter({
      client,
      getEnvironment: () => ({
        VITE_POSTHOG_KEY: 'phc_test_project_key',
        VITE_POSTHOG_HOST: 'https://us.i.posthog.com',
      }),
      isOptedOut: () => false,
      getContext: () => context,
      getLocation: () => ({ search: '?dev=1&posthog_test=1' }),
      getSessionStore: () => sessionStore,
      warn: () => {},
      ...overrides,
    }),
  }
}

const ready = adapter()
assert.equal(ready.instance.initPostHog(), true)
assert.equal(ready.instance.initPostHog(), true)
assert.equal(ready.client.calls.init.length, 1)

const [projectKey, config] = ready.client.calls.init[0]
assert.equal(projectKey, 'phc_test_project_key')
assert.equal(config.api_host, 'https://us.i.posthog.com')
assert.deepEqual(config.bootstrap, {
  distinctID: context.visitorId,
  isIdentifiedID: false,
})
assert.equal(config.persistence, 'localStorage')
assert.equal(config.capture_pageview, false)
assert.equal(config.capture_pageleave, false)
assert.equal(config.autocapture, false)
assert.equal(config.disable_session_recording, true)
assert.equal(config.disable_surveys, true)
assert.equal(config.advanced_disable_feature_flags, true)
assert.equal(config.capture_exceptions, false)
assert.equal(config.capture_performance, false)
assert.equal(config.disableDeviceModel, true)
assert.equal(config.respect_dnt, true)
assert.equal(config.person_profiles, 'never')

assert.equal(ready.instance.captureProductSignal('any_product_signal', {
  arbitrary_number: 42,
  arbitrary_boolean: false,
  source_session_id: 'cannot_override_common_context',
}), true)
assert.deepEqual(ready.client.calls.capture[0], [
  'any_product_signal',
  {
    arbitrary_number: 42,
    arbitrary_boolean: false,
    source_session_id: context.sessionId,
    visit_count: context.visitCount,
    dev: true,
  },
])

assert.equal(ready.instance.captureConnectionTest(), true)
assert.equal(ready.instance.captureConnectionTest(), false)
assert.deepEqual(ready.client.calls.capture[1], [
  POSTHOG_CONNECTION_TEST_EVENT,
  {
    source: 'sdk_connection_test',
    source_session_id: context.sessionId,
    visit_count: context.visitCount,
    dev: true,
  },
])

const optedOut = adapter({ isOptedOut: () => true })
assert.equal(optedOut.instance.initPostHog(), false)
assert.equal(optedOut.instance.captureProductSignal('blocked'), false)
assert.equal(optedOut.client.calls.init.length, 0)
assert.equal(optedOut.client.calls.capture.length, 0)

const missingKey = adapter({
  getEnvironment: () => ({ VITE_POSTHOG_KEY: '', VITE_POSTHOG_HOST: '' }),
})
assert.equal(missingKey.instance.initPostHog(), false)
assert.equal(missingKey.client.calls.init.length, 0)

const ordinaryVisit = adapter({
  getLocation: () => ({ search: '?dev=1' }),
})
ordinaryVisit.instance.initPostHog()
assert.equal(ordinaryVisit.instance.captureConnectionTest(), false)
assert.equal(ordinaryVisit.client.calls.capture.length, 0)

const brokenClient = fakeClient()
brokenClient.init = () => { throw new Error('init failed') }
const initFailure = adapter({ client: brokenClient })
assert.equal(initFailure.instance.initPostHog(), false)

const captureClient = fakeClient()
captureClient.capture = () => { throw new Error('capture failed') }
const captureFailure = adapter({ client: captureClient })
assert.equal(captureFailure.instance.initPostHog(), true)
assert.equal(captureFailure.instance.captureProductSignal('failed_signal'), false)

const storageFailure = adapter({
  getSessionStore: () => { throw new Error('storage blocked') },
})
storageFailure.instance.initPostHog()
assert.equal(storageFailure.instance.captureConnectionTest(), false)

console.log('PostHog SDK adapter behavior: PASS')
