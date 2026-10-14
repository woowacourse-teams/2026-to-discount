/**
 * 최근 누른 브랜드. 브라우저에만 남는다(localStorage).
 *
 * 할인 링크나 배너로 배달앱에 간 브랜드를 최근 순으로 적는다. 분류 바의 "최근" 탭이
 * 이 목록으로 거른다(2026-10-14 사용자 결정). 로그인이 없어 서버에는 두지 않는다.
 * 저장소가 막혔거나 값이 깨졌으면 빈 목록이다 - 편의 기능이라 화면을 막으면 안 된다.
 */
const KEY = 'dk_recent_brands'
const MAX = 20

export function readRecent(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : []
  } catch {
    return []
  }
}

/** 맨 앞에 넣고 겹침을 뺀다. 최대 MAX개. */
export function rememberBrand(name, storage = globalThis.localStorage) {
  if (!name || name === 'none') return readRecent(storage)
  const next = [name, ...readRecent(storage).filter((n) => n !== name)].slice(0, MAX)
  try {
    storage?.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장이 막혀도 클릭은 그대로 간다.
  }
  return next
}
