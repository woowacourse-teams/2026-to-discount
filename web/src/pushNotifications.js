import { API_BASE } from './api.js'

export function isIos(navigatorValue = globalThis.navigator) {
  if (!navigatorValue) return false
  return /iPad|iPhone|iPod/.test(navigatorValue.userAgent || '') || (
    navigatorValue.platform === 'MacIntel' && navigatorValue.maxTouchPoints > 1
  )
}

export function isStandalone(windowValue = globalThis.window, navigatorValue = globalThis.navigator) {
  return Boolean(
    navigatorValue?.standalone === true ||
    windowValue?.matchMedia?.('(display-mode: standalone)').matches,
  )
}

export function pushAvailability({
  windowValue = globalThis.window,
  navigatorValue = globalThis.navigator,
  notificationValue = globalThis.Notification,
  pushManagerValue = globalThis.PushManager,
} = {}) {
  if (!navigatorValue?.serviceWorker || !pushManagerValue || !notificationValue) return 'unsupported'
  if (isIos(navigatorValue) && !isStandalone(windowValue, navigatorValue)) return 'ios-install'
  if (notificationValue.permission === 'denied') return 'denied'
  return 'ready'
}

export function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const decoded = globalThis.atob(base64)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

async function registration(navigatorValue) {
  await navigatorValue.serviceWorker.register('/sw.js')
  return navigatorValue.serviceWorker.ready
}

function subscriptionBody(subscription, visitorId, analyticsEnabled) {
  const serialized = subscription.toJSON()
  return {
    endpoint: serialized.endpoint,
    keys: serialized.keys,
    visitorId,
    analyticsEnabled,
  }
}

async function saveSubscription(subscription, visitorId, analyticsEnabled, fetchValue) {
  const response = await fetchValue(`${API_BASE}/api/push/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscriptionBody(subscription, visitorId, analyticsEnabled)),
  })
  if (!response.ok) throw new Error(`Push subscription ${response.status}`)
}

export async function currentSubscription({ navigatorValue = globalThis.navigator } = {}) {
  if (!navigatorValue?.serviceWorker) return null
  const worker = await registration(navigatorValue)
  return worker.pushManager.getSubscription()
}

export async function refreshExistingSubscription({
  visitorId,
  analyticsEnabled,
  navigatorValue = globalThis.navigator,
  fetchValue = globalThis.fetch,
} = {}) {
  const subscription = await currentSubscription({ navigatorValue })
  if (!subscription) return false
  await saveSubscription(subscription, visitorId, analyticsEnabled, fetchValue)
  return true
}

export async function enablePush({
  visitorId,
  analyticsEnabled,
  navigatorValue = globalThis.navigator,
  notificationValue = globalThis.Notification,
  fetchValue = globalThis.fetch,
} = {}) {
  const permission = notificationValue.permission === 'granted'
    ? 'granted'
    : await notificationValue.requestPermission()
  if (permission !== 'granted') return false

  const keyResponse = await fetchValue(`${API_BASE}/api/push/public-key`)
  if (!keyResponse.ok) throw new Error(`Push public key ${keyResponse.status}`)
  const { publicKey } = await keyResponse.json()
  const worker = await registration(navigatorValue)
  const existing = await worker.pushManager.getSubscription()
  const subscription = existing || await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
  await saveSubscription(subscription, visitorId, analyticsEnabled, fetchValue)
  return true
}

export async function disablePush({
  navigatorValue = globalThis.navigator,
  fetchValue = globalThis.fetch,
} = {}) {
  const subscription = await currentSubscription({ navigatorValue })
  if (!subscription) return false
  const response = await fetchValue(`${API_BASE}/api/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  if (!response.ok) throw new Error(`Push unsubscribe ${response.status}`)
  await subscription.unsubscribe()
  return true
}
