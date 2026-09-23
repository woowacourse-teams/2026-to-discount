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

function navigatorWith(existing = null, created = subscription()) {
  const pushManager = {
    getSubscription: async () => existing,
    subscribe: async () => created,
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

test('일반 Safari가 알림 API를 감춰도 iOS 설치 안내 대상으로 본다', () => {
  const ios = { userAgent: 'Mozilla iPad', standalone: false }
  assert.equal(pushAvailability({
    navigatorValue: ios,
    windowValue: { matchMedia: () => ({ matches: false }) },
    notificationValue: undefined,
    pushManagerValue: undefined,
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

test('새 구독 저장이 실패하면 새 브라우저 구독만 해제한다', async () => {
  const created = subscription()
  let unsubscribed = false
  created.unsubscribe = async () => { unsubscribed = true; return true }
  const fetchValue = async (url) => url.endsWith('/public-key')
    ? { ok: true, json: async () => ({ publicKey: 'AQ' }) }
    : { ok: false, status: 503 }

  await assert.rejects(enablePush({
    visitorId: 'v_new',
    analyticsEnabled: true,
    navigatorValue: navigatorWith(null, created),
    notificationValue: { permission: 'granted' },
    fetchValue,
  }), /Push subscription 503/)
  assert.equal(unsubscribed, true)
})

test('기존 구독 저장이 실패하면 브라우저 구독을 유지한다', async () => {
  const existing = subscription()
  let unsubscribed = false
  existing.unsubscribe = async () => { unsubscribed = true; return true }
  const fetchValue = async (url) => url.endsWith('/public-key')
    ? { ok: true, json: async () => ({ publicKey: 'AQ' }) }
    : { ok: false, status: 503 }

  await assert.rejects(enablePush({
    visitorId: 'v_existing',
    analyticsEnabled: true,
    navigatorValue: navigatorWith(existing),
    notificationValue: { permission: 'granted' },
    fetchValue,
  }), /Push subscription 503/)
  assert.equal(unsubscribed, false)
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

  assert.deepEqual(await disablePush({ navigatorValue, fetchValue }), {
    localUnsubscribed: true,
    serverDeleted: true,
    endpoint: existing.endpoint,
  })
  assert.equal(requests[1].options.method, 'DELETE')
  assert.equal(unsubscribed, true)
})

test('브라우저 구독 해제 실패 시 서버 구독을 삭제하지 않는다', async () => {
  const existing = subscription()
  existing.unsubscribe = async () => false
  const requests = []

  const result = await disablePush({
    navigatorValue: navigatorWith(existing),
    fetchValue: async (...args) => { requests.push(args); return { ok: true } },
  })

  assert.deepEqual(result, {
    localUnsubscribed: false,
    serverDeleted: false,
    endpoint: existing.endpoint,
  })
  assert.equal(requests.length, 0)
})

test('브라우저 해제 후 서버 삭제 실패를 분리해 반환한다', async () => {
  const existing = subscription()
  const result = await disablePush({
    navigatorValue: navigatorWith(existing),
    fetchValue: async () => ({ ok: false, status: 503 }),
  })

  assert.deepEqual(result, {
    localUnsubscribed: true,
    serverDeleted: false,
    endpoint: existing.endpoint,
  })
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
