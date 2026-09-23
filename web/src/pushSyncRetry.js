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
  let generation = 0

  function clearTimer() {
    if (timer === null) return
    clearTimeoutValue(timer)
    timer = null
  }

  async function run(runGeneration = generation) {
    if (!task || running) return
    const currentTask = task
    clearTimer()
    running = true
    try {
      await currentTask()
      if (runGeneration !== generation) return
      task = null
      attempt = 0
      onSuccess?.()
    } catch {
      if (runGeneration !== generation) return
      onFailure?.()
      const delay = PUSH_SYNC_RETRY_DELAYS[attempt]
      if (delay !== undefined) {
        attempt += 1
        timer = setTimeoutValue(() => run(runGeneration), delay)
      }
    } finally {
      running = false
      if (runGeneration !== generation && task) void run(generation)
    }
  }

  function start(nextTask) {
    generation += 1
    task = nextTask
    attempt = 0
    void run(generation)
  }

  function retryNow() {
    void run(generation)
  }

  function stop() {
    generation += 1
    clearTimer()
    task = null
  }

  return { start, retryNow, stop }
}
