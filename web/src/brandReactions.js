/**
 * 브랜드 카드 좋아요/싫어요. 브라우저에만 남는다(localStorage).
 *
 * 서버 정본이 없다 - visitorId도 이 브라우저의 난수라, 서버가 들고 있어도 다른 기기의
 * 같은 사람을 찾을 열쇠가 없다. 분석은 `brand_reaction` 이벤트(원장)에서 접는다.
 * 설계 docs/design/309-brand-reaction.md.
 */
const KEY = 'dk_brand_reactions'

export const LIKE = 'like'
export const DISLIKE = 'dislike'
export const NONE = 'none'

/** `{ [브랜드]: 'like' | 'dislike' }`. 저장소가 막혔거나 값이 깨졌으면 빈 목록. */
export function readReactions(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const valid = (v) => (v === LIKE || v === DISLIKE ? v : NONE)

/** 이 브랜드의 반응. 대표명으로 못 찾으면 searchAliases로 한 번 더 찾는다(대표명이 바뀐 날 대비). */
export function reactionOf(map, brand) {
  const hit = [brand.name, ...(brand.searchAliases ?? [])].find((k) => valid(map[k]) !== NONE)
  return hit === undefined ? NONE : valid(map[hit])
}

/** 누른 버튼에 따른 다음 상태. 같은 걸 다시 누르면 취소, 반대쪽이면 바뀐다. */
export function nextReaction(current, pressed) {
  return current === pressed ? NONE : pressed
}

/** 반응을 적는다. `none`이면 지운다. 대표명과 별칭 열쇠를 모두 치우고 새 이름으로만 적는다. */
export function setReaction(map, brand, reaction, storage = globalThis.localStorage) {
  const next = { ...map }
  for (const k of [brand.name, ...(brand.searchAliases ?? [])]) delete next[k]
  if (reaction === LIKE || reaction === DISLIKE) next[brand.name] = reaction
  try {
    storage?.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장이 막혀도 이번 방문 동안은 화면 상태로 산다.
  }
  return next
}
