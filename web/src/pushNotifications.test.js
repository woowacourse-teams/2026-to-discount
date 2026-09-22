import assert from 'node:assert/strict'
import test from 'node:test'
import {
  disablePush,
  enablePush,
  isIos,
  isStandalone,
  pushAvailability,
  refreshExistingSubscription,
  syncPushSubscription,
} from './pushNotifications.js'

function subscription() {
  return {
    endpoint: 'https://push.example/subscription',
    toJSON: () => ({
      endpoint: 'https://push.example/subscription',
      keys: { p256dh: 'key', auth: 'auth' },
    }),
    unsubscribe: async () => true,
  }
}

function navigatorWith(existing = null) {
  const pushManager = {
    getSubscription: async () => existing,
    subscribe: async () => subscription(),
  }
  return {
    userAgent: 'Chrome',
    serviceWorker: {
      register: async () => undefined,
      ready: Promise.resolve({ pushManager }),
    },
  }
}

test('iOS는 홈 화면 실행 전까지 권한 요청 대상으로 보지 않는다', () => {
  const ios = { userAgent: 'Mozilla iPhone', standalone: false }
  assert.equal(isIos(ios), true)
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }) }, ios), false)
  assert.equal(pushAvailability({
    navigatorValue: { ...ios, serviceWorker: {} },
    windowValue: { matchMedia: () => ({ matches: false }) },
    notificationValue: { permission: 'default' },
    pushManagerValue: function PushManager() {},
  }), 'ios-install')
})

test('사용자 동작 뒤 구독을 만들고 visitorId와 함께 저장한다', async () => {
  const requests = []
  const fetchValue = async (url, options = {}) => {
    requests.push({ url, options })
    if (url.endsWith('/public-key')) return { ok: true, json: async () => ({ publicKey: 'AQ' }) }
    return { ok: true }
  }
  const enabled = await enablePush({
    visitorId: 'v_123',
    analyticsEnabled: true,
    navigatorValue: navigatorWith(),
    notificationValue: { permission: 'default', requestPermission: async () => 'granted' },
    fetchValue,
  })

  assert.equal(enabled, true)
  const body = JSON.parse(requests[1].options.body)
  assert.equal(body.visitorId, 'v_123')
  assert.equal(body.analyticsEnabled, true)
  assert.equal(body.endpoint, 'https://push.example/subscription')
})

test('기존 구독은 현재 visitorId로 갱신하고 해제할 수 있다', async () => {
  const existing = subscription()
  let unsubscribed = false
  existing.unsubscribe = async () => { unsubscribed = true; return true }
  const requests = []
  const fetchValue = async (url, options = {}) => {
    requests.push({ url, options })
    return { ok: true }
  }
  const navigatorValue = navigatorWith(existing)

  assert.equal(await refreshExistingSubscription({
    visitorId: 'v_new', analyticsEnabled: false, navigatorValue, fetchValue,
  }), true)
  assert.equal(JSON.parse(requests[0].options.body).visitorId, 'v_new')

  assert.equal(await disablePush({ navigatorValue, fetchValue }), true)
  assert.equal(requests[1].options.method, 'DELETE')
  assert.equal(unsubscribed, true)
})

test('브라우저 구독 조회와 서버 동기화를 분리할 수 있다', async () => {
  const existing = subscription()
  const requests = []
  const fetchValue = async (url, options = {}) => {
    requests.push({ url, options })
    return { ok: true }
  }

  await syncPushSubscription({
    subscription: existing,
    visitorId: 'v_local',
    analyticsEnabled: true,
    fetchValue,
  })

  assert.equal(requests.length, 1)
  assert.equal(JSON.parse(requests[0].options.body).visitorId, 'v_local')
})
