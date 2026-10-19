// SDK의 공개 before_send 경계에서 받은 이벤트만 전송한다. SDK 내부 재시도와 겹치지 않는다.
const COOLDOWN_MS = 5 * 60_000
const MAX_AGE_MS = 10 * 60_000
const MAX_EVENTS = 100
const MAX_BATCH_BYTES = 48 * 1024
const RETRY_DELAYS = [5000, 30_000]

export function retryAfterMs(value, now) {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : 0
}

export function createPostHogDelivery({
  host, key, isOptedOut,
  fetchRequest = (...args) => fetch(...args),
  now = Date.now,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let queue = []
  let timer
  let busy = false
  let pausedUntil = 0
  let retryAt = 0
  let failures = 0
  let recovering = false
  const bytes = (value) => new TextEncoder().encode(value).length
  const bodyFor = (events) => JSON.stringify({ api_key: key, batch: events })

  function clearSchedule() {
    if (timer !== undefined) clearTimer(timer)
    timer = undefined
  }

  function schedule(delay) {
    clearSchedule()
    // 타이머의 32비트 상한보다 긴 Retry-After는 나눠 기다린다.
    timer = setTimer(() => { timer = undefined; void flush() }, Math.min(delay, 2_147_483_647))
  }

  function pause(wait = 0) {
    pausedUntil = now() + Math.max(COOLDOWN_MS, wait)
    recovering = true
    failures = 0
    retryAt = 0
    if (queue.length) schedule(pausedUntil - now())
  }

  async function flush() {
    clearSchedule()
    if (isOptedOut()) { queue = []; return }
    if (busy) return
    queue = queue.filter((item) => now() - item.createdAt < MAX_AGE_MS)
    if (!queue.length) return
    const waitUntil = Math.max(pausedUntil, retryAt)
    if (now() < waitUntil) { schedule(waitUntil - now()); return }

    const selected = []
    for (const item of queue) {
      if (selected.length >= (recovering ? 1 : 20)) break
      if (bytes(bodyFor([...selected.map((entry) => entry.event), item.event])) > MAX_BATCH_BYTES) break
      selected.push(item)
    }
    if (!selected.length) { queue.shift(); schedule(0); return }
    const body = bodyFor(selected.map((item) => item.event))
    busy = true
    const controller = new AbortController()
    const timeout = setTimer(() => controller.abort(), 15_000)
    let response
    let text = ''
    try {
      response = await fetchRequest(`${host}/batch/`, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body, keepalive: true, signal: controller.signal,
      })
      if (!response.ok) text = await response.text()
    } catch {
      response = undefined
    } finally {
      clearTimer(timeout)
      busy = false
    }
    // 전송 중 수집 거부가 켜져도 보류 이벤트와 재시도를 남기지 않는다.
    if (isOptedOut()) { queue = []; return }
    if (response?.ok) {
      const sent = new Set(selected)
      queue = queue.filter((item) => !sent.has(item))
      failures = 0
      recovering = false
      pausedUntil = 0
      retryAt = 0
      if (queue.length) schedule(1000)
      return
    }
    const wait = retryAfterMs(response?.headers.get('Retry-After'), now())
    const retryable = !response || response.status === 408 || response.status === 429 || response.status >= 500
    if (!retryable) {
      const rejected = new Set(selected)
      queue = queue.filter((item) => !rejected.has(item))
      pause(wait)
    } else if (/blocked\s+request/i.test(text) || recovering || failures >= RETRY_DELAYS.length) {
      pause(wait)
    } else {
      const delay = RETRY_DELAYS[failures++] * (0.9 + random() * 0.2)
      retryAt = now() + Math.max(delay, wait)
      schedule(retryAt - now())
    }
  }

  function enqueue(event) {
    if (!event || isOptedOut()) { queue = []; clearSchedule(); return false }
    // 차단 중 새 이벤트는 쌓지 않는다. 기존 실패 이벤트만 제한된 시간 동안 보관한다.
    if (now() < pausedUntil) return false
    queue = queue.filter((item) => now() - item.createdAt < MAX_AGE_MS)
    if (queue.length >= MAX_EVENTS) return false
    let snapshot
    try {
      // UUID, 발생 시각, SDK 속성을 최초 캡처 시점 그대로 고정한다.
      snapshot = JSON.parse(JSON.stringify(event))
      if (bytes(bodyFor([snapshot])) > MAX_BATCH_BYTES) return false
    } catch { return false }
    queue.push({ event: snapshot, createdAt: now() })
    if (!busy && timer === undefined) schedule(1000)
    return true
  }

  return { enqueue, flush }
}
