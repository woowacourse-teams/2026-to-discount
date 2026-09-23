self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  event.waitUntil((async () => {
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/notification-icon.svg',
      data: { clickUrl: payload.url },
      tag: payload.notificationId,
    })
    if (payload.displayedUrl) {
      await fetch(payload.displayedUrl, { method: 'POST' }).catch(() => undefined)
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const clickUrl = event.notification.data?.clickUrl || '/'
  event.waitUntil((async () => {
    let targetUrl = clickUrl
    try {
      const response = await fetch(clickUrl, { redirect: 'follow' })
      targetUrl = response.url || targetUrl
    } catch {
      await clients.openWindow(clickUrl)
      return
    }

    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const sameOrigin = windows.find((client) => new URL(client.url).origin === new URL(targetUrl).origin)
    if (sameOrigin) {
      await sameOrigin.navigate(targetUrl)
      await sameOrigin.focus()
      return
    }
    await clients.openWindow(targetUrl)
  })())
})
