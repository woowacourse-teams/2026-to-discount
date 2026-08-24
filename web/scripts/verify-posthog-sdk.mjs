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
  dev: undefined,
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
// SDK 자동 pageview는 꺼야 한다. 우리도 page_view를 쏘는데 SDK가 스스로
// 쏘는 것은 우리 eventId를 모른다 — $insert_id가 달라 중복 제거가 안 걸리고
// 같은 방문이 두 번 찍힌다(2026-08-21 실측).
assert.equal(config.capture_pageview, false)
// pageleave는 남긴다. 우리 page_exit과 이름이 달라($pageleave) 중복 계상이
// 아니고, PostHog 기본 지표(이탈률·세션 길이)가 이 이벤트를 쓴다.
assert.equal(config.capture_pageleave, true)
assert.equal(config.autocapture, false)
assert.equal(config.disable_session_recording, true)
assert.equal(config.disable_surveys, true)
assert.equal(config.advanced_disable_feature_flags, true)
assert.equal(config.capture_exceptions, false)
assert.deepEqual(config.capture_performance, { web_vitals: true })
assert.equal(config.disableDeviceModel, false)
assert.equal(config.respect_dnt, true)
// 서버 릴레이와 같은 방침이어야 한다. 서버는 $process_person_profile을
// 안 붙여 프로필을 만드는데 클라이언트만 'never'면, 같은 이벤트라도 어느
// 쪽이 먼저 닿느냐에 따라 프로필이 생겼다 말았다 한다.
assert.equal(config.person_profiles, 'always')

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
  },
])

const clientTs = '2026-08-20T01:02:03.456Z'
assert.equal(ready.instance.captureAnalyticsEvent({
  event: 'brand_expand',
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  visitorId: context.visitorId,
  sessionId: context.sessionId,
  visitCount: context.visitCount,
  path: '/discounts',
  referrer: 'direct',
  device: 'mobile',
  variant: 'a',
  viewport: '390x844',
  props: {
    category: 'chicken',
    $insert_id: 'cannot_override_event_id',
    source_session_id: 'cannot_override_common_context',
  },
  clientTs,
}), true)
const [domainEventName, domainEventProperties, domainEventOptions] = ready.client.calls.capture[1]
assert.equal(domainEventName, 'brand_expand')
assert.deepEqual(domainEventProperties, {
  category: 'chicken',
  $insert_id: '123e4567-e89b-42d3-a456-426614174000',
  source_session_id: context.sessionId,
  visit_count: context.visitCount,
  path: '/discounts',
  referrer: 'direct',
  device: 'mobile',
  // A/B 갈래는 서버 매퍼도 같은 이름으로 넘긴다. 빠지면 PostHog에서
  // 두 안을 구분하지 못한다.
  variant: 'a',
  viewport: '390x844',
})

// 개발 추정 표시는 더 이상 붙이지 않는다. 좁은 desktop을 개발 트래픽으로
// 몰던 규칙이 안드로이드 폰 사용자를 걸러냈다. viewport만 실어 보내고
// 판정은 원장 전체를 보는 scripts/experiments.py가 한다.
const captured = (device, viewport) => {
  const fresh = adapter()
  fresh.instance.initPostHog()
  fresh.instance.captureAnalyticsEvent({
    event: 'brand_expand',
    eventId: '123e4567-e89b-42d3-a456-426614174111',
    visitorId: context.visitorId,
    device,
    viewport,
  })
  return fresh.client.calls.capture.at(-1)?.[1]
}
assert.equal(captured('desktop', '360x900').dev_suspect, undefined)
assert.equal(captured('desktop', '360x900').viewport, '360x900')
assert.equal(captured('mobile', '360x780').dev_suspect, undefined)

assert.equal(domainEventOptions.uuid, '123e4567-e89b-42d3-a456-426614174000')
assert.equal(domainEventOptions.timestamp.toISOString(), clientTs)
assert.equal(domainEventOptions.send_instantly, undefined)
assert.equal(domainEventOptions.transport, undefined)

assert.equal(ready.instance.captureAnalyticsEvent({
  event: 'page_view',
  eventId: '123e4567-e89b-42d3-a456-426614174005',
  sessionId: context.sessionId,
  visitCount: context.visitCount,
  path: '/discounts',
  clientTs,
}), true)
const [pageViewName, pageViewProperties, pageViewOptions] = ready.client.calls.capture[2]
assert.equal(pageViewName, '$pageview')
assert.equal(pageViewProperties.$insert_id, '123e4567-e89b-42d3-a456-426614174005')
assert.equal(pageViewProperties.source_session_id, context.sessionId)
assert.equal(pageViewProperties.path, '/discounts')
assert.equal(pageViewOptions.uuid, '123e4567-e89b-42d3-a456-426614174005')
assert.equal(pageViewOptions.timestamp.toISOString(), clientTs)

assert.equal(ready.instance.captureAnalyticsEvent({
  event: 'page_exit',
  eventId: '123e4567-e89b-42d3-a456-426614174001',
  sessionId: context.sessionId,
  visitCount: context.visitCount,
  path: '/discounts',
  dwellMs: 4321,
  clientTs,
}), true)
const [pageExitName, pageExitProperties, pageExitOptions] = ready.client.calls.capture[3]
assert.equal(pageExitName, 'page_exit')
assert.equal(pageExitProperties.dwell_ms, 4321)
assert.equal(pageExitOptions.send_instantly, true)
assert.equal(pageExitOptions.transport, 'sendBeacon')
assert.equal(pageExitOptions.timestamp.toISOString(), clientTs)

assert.equal(ready.instance.captureAnalyticsEvent({
  event: 'brand_expand',
  eventId: '123e4567-e89b-42d3-a456-426614174002',
  dev: true,
}), false)
assert.equal(ready.client.calls.capture.length, 4)
assert.equal(ready.instance.captureAnalyticsEvent({ event: 'brand_expand' }), false)

const optedOut = adapter({ isOptedOut: () => true })
assert.equal(optedOut.instance.initPostHog(), false)
assert.equal(optedOut.instance.captureProductSignal('blocked'), false)
assert.equal(optedOut.instance.captureAnalyticsEvent({
  event: 'brand_expand',
  eventId: '123e4567-e89b-42d3-a456-426614174003',
}), false)
assert.equal(optedOut.client.calls.init.length, 0)
assert.equal(optedOut.client.calls.capture.length, 0)

const missingKey = adapter({
  getEnvironment: () => ({ VITE_POSTHOG_KEY: '', VITE_POSTHOG_HOST: '' }),
})
assert.equal(missingKey.instance.initPostHog(), false)
assert.equal(missingKey.client.calls.init.length, 0)

const ordinaryVisit = adapter({
  getContext: () => ({ ...context, dev: true }),
  getLocation: () => ({ search: '?dev=1' }),
})
assert.equal(ordinaryVisit.instance.initPostHog(), true)
const [, ordinaryConfig] = ordinaryVisit.client.calls.init[0]
assert.equal(ordinaryConfig.capture_pageview, false)
assert.equal(ordinaryConfig.capture_pageleave, false)
assert.equal(ordinaryConfig.capture_performance, false)
assert.equal(ordinaryVisit.instance.captureProductSignal('any_product_signal'), false)
assert.equal(ordinaryVisit.instance.captureConnectionTest(), false)
assert.equal(ordinaryVisit.client.calls.capture.length, 0)

const diagnostic = adapter({
  getContext: () => ({ ...context, dev: true }),
})
assert.equal(diagnostic.instance.initPostHog(), true)
assert.equal(diagnostic.instance.captureConnectionTest(), true)
assert.equal(diagnostic.instance.captureConnectionTest(), false)
assert.deepEqual(diagnostic.client.calls.capture[0], [
  POSTHOG_CONNECTION_TEST_EVENT,
  {
    source: 'sdk_connection_test',
    source_session_id: context.sessionId,
    visit_count: context.visitCount,
    dev: true,
  },
])

const brokenClient = fakeClient()
brokenClient.init = () => { throw new Error('init failed') }
const initFailure = adapter({ client: brokenClient })
assert.equal(initFailure.instance.initPostHog(), false)

const captureClient = fakeClient()
captureClient.capture = () => { throw new Error('capture failed') }
const captureFailure = adapter({ client: captureClient })
assert.equal(captureFailure.instance.initPostHog(), true)
assert.equal(captureFailure.instance.captureProductSignal('failed_signal'), false)
assert.equal(captureFailure.instance.captureAnalyticsEvent({
  event: 'brand_expand',
  eventId: '123e4567-e89b-42d3-a456-426614174004',
}), false)

const storageFailure = adapter({
  getSessionStore: () => { throw new Error('storage blocked') },
})
storageFailure.instance.initPostHog()
assert.equal(storageFailure.instance.captureConnectionTest(), false)

console.log('PostHog SDK adapter behavior: PASS')
