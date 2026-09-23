import { API_BASE } from './api.js'

const registrationPromises = new WeakMap()

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
  if (isIos(navigatorValue) && !isStandalone(windowValue, navigatorValue)) return 'ios-install'
  if (!navigatorValue?.serviceWorker || !pushManagerValue || !notificationValue) return 'unsupported'
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
  if (!registrationPromises.has(navigatorValue)) {
    const promise = navigatorValue.serviceWorker.register('/sw.js')
      .then(() => navigatorValue.serviceWorker.ready)
      .catch((error) => {
        registrationPromises.delete(navigatorValue)
        throw error
      })
    registrationPromises.set(navigatorValue, promise)
  }
  return registrationPromises.get(navigatorValue)
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

export async function syncPushSubscription({
  subscription,
  visitorId,
  analyticsEnabled,
  fetchValue = globalThis.fetch,
} = {}) {
  await saveSubscription(subscription, visitorId, analyticsEnabled, fetchValue)
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
  const created = !existing
  const subscription = existing || await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  try {
    await saveSubscription(subscription, visitorId, analyticsEnabled, fetchValue)
  } catch (error) {
    if (created) await subscription.unsubscribe().catch(() => {})
    throw error
  }
  return true
}

export async function disablePush({
  navigatorValue = globalThis.navigator,
  fetchValue = globalThis.fetch,
} = {}) {
  const subscription = await currentSubscription({ navigatorValue })
  if (!subscription) return { localUnsubscribed: true, serverDeleted: true, endpoint: null }
  const endpoint = subscription.endpoint
  let localUnsubscribed = false
  try {
    localUnsubscribed = await subscription.unsubscribe()
  } catch {
    return { localUnsubscribed: false, serverDeleted: false, endpoint }
  }
  if (!localUnsubscribed) return { localUnsubscribed: false, serverDeleted: false, endpoint }

  try {
    await deletePushSubscription(endpoint, fetchValue)
    return { localUnsubscribed: true, serverDeleted: true, endpoint }
  } catch {
    return { localUnsubscribed: true, serverDeleted: false, endpoint }
  }
}

export async function deletePushSubscription(endpoint, fetchValue = globalThis.fetch) {
  const response = await fetchValue(`${API_BASE}/api/push/subscriptions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!response.ok) throw new Error(`Push unsubscribe ${response.status}`)
}
