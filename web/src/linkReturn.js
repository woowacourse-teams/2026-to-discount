/**
 * 배달앱에 갔다가 돌아온 것을 잰다(2026-10-14, 신뢰를 재는 프론트 지표).
 *
 * 링크나 배너를 누르면 그 순간을 탭 저장소(sessionStorage)에 적고, 화면이 다시 보이거나
 * 같은 탭으로 다시 열리면 `app_return`을 한 번 보낸다. 빨리 돌아온 것 하나로는 뜻이
 * 갈리지 않는다(할인이 달라 실망, 더 찾아보려고, 앱이 안 열림). 그래서 돌아온 뒤의 동작은
 * 원장의 다음 이벤트로 이어 붙여 가른다(docs/ANALYTICS.md `app_return`).
 * 저장소가 막히면 아무것도 안 보낸다 - 계측이 화면을 막으면 안 된다.
 */
const KEY = 'dk_last_exit'
// 이보다 오래 떠나 있었으면 같은 방문으로 보지 않는다(밥 먹고 다음 날 돌아온 것).
export const MAX_AWAY_MS = 6 * 60 * 60 * 1000

function read(store) {
  try { return JSON.parse(store?.getItem(KEY) || 'null') } catch { return null }
}
function write(store, value) {
  try { value ? store?.setItem(KEY, JSON.stringify(value)) : store?.removeItem(KEY) } catch { /* 막힘 */ }
}

/** 링크나 배너를 누른 순간. */
export function noteExit(props, now = Date.now(), store = globalThis.sessionStorage) {
  write(store, { brand: props?.brand ?? null, platform: props?.platform ?? null, where: props?.where ?? null, at: now, hidden: false })
}

/** 화면이 가려졌다(앱이나 새 탭으로 갔다). */
export function noteHidden(store = globalThis.sessionStorage) {
  const last = read(store)
  if (last && !last.hidden) write(store, { ...last, hidden: true })
}

/**
 * 돌아왔으면 보낼 속성을 주고 기록을 지운다. 안 떠났거나(가려진 적 없음) 너무 오래면 null.
 * reloaded: 같은 탭으로 갔다가 페이지가 새로 열린 경우(가려짐을 못 적었어도 떠난 것이다).
 */
export function takeReturn(now = Date.now(), store = globalThis.sessionStorage, { reloaded = false } = {}) {
  const last = read(store)
  if (!last || !(last.hidden || reloaded)) return null
  write(store, null)
  const awayMs = now - last.at
  if (!(awayMs >= 0) || awayMs > MAX_AWAY_MS) return null
  return { brand: last.brand, platform: last.platform, where: last.where, awayMs, reloaded }
}
