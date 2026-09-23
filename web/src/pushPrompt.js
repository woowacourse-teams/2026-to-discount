const STORAGE_KEY = 'discount_push_prompt'
const MAX_IMPRESSIONS = 3

function read(storage) {
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function write(storage, value) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 저장소가 막혀도 알림 설정 자체는 계속 사용할 수 있어야 한다.
  }
}

export function recordPromptVisit(storage = globalThis.localStorage) {
  const state = read(storage)
  if (!state.visited) {
    write(storage, { ...state, visited: true, impressions: 0 })
    return false
  }
  if (state.declined || (state.impressions || 0) >= MAX_IMPRESSIONS) return false

  write(storage, { ...state, impressions: (state.impressions || 0) + 1 })
  return true
}

export function declinePrompt(storage = globalThis.localStorage) {
  write(storage, { ...read(storage), visited: true, declined: true })
}
