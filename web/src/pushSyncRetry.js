export const PUSH_SYNC_RETRY_DELAYS = [5_000, 15_000, 60_000]

export function createPushSyncRetry({
  onFailure,
  onSuccess,
  setTimeoutValue = globalThis.setTimeout,
  clearTimeoutValue = globalThis.clearTimeout,
} = {}) {
  let task = null
  let attempt = 0
  let timer = null
  let running = false

  function clearTimer() {
    if (timer === null) return
    clearTimeoutValue(timer)
    timer = null
  }

  async function run() {
    if (!task || running) return
    clearTimer()
    running = true
    try {
      await task()
      task = null
      attempt = 0
      onSuccess?.()
    } catch {
      onFailure?.()
      const delay = PUSH_SYNC_RETRY_DELAYS[attempt]
      if (delay !== undefined) {
        attempt += 1
        timer = setTimeoutValue(run, delay)
      }
    } finally {
      running = false
    }
  }

  function start(nextTask) {
    task = nextTask
    attempt = 0
    void run()
  }

  function retryNow() {
    void run()
  }

  function stop() {
    clearTimer()
    task = null
  }

  return { start, retryNow, stop }
}
