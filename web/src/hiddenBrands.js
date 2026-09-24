/**
 * 싫은 브랜드 숨기기. 브라우저에만 남는다(localStorage).
 *
 * 왜 서버가 아닌가 - 이 서비스는 로그인이 없다. 누가 무엇을 싫어하는지 서버가 알
 * 이유도 없다. 기기마다 따로 남고, 저장소가 막힌 브라우저에서는 그 방문 동안만 산다.
 *
 * 숨길 때 그 순간의 최고 할인액을 같이 적어 둔다. 나중에 그보다 커지면 "그때보다
 * 좋아졌다"고 말해 줄 수 있다 - 싫어서 숨긴 것과 "지금은 안 좋아서" 숨긴 것이 다르고,
 * 후자는 되살아나야 한다(사용자 2026-09-24).
 */
const KEY = 'dk_hidden_brands'

/** 되살리는 규칙. 사용자가 브랜드마다 고른다. */
export const NEVER = 'never'        // 다시 안 본다
export const WHEN_BIGGER = 'bigger' // 숨길 때보다 할인이 커지면 다시 보여 준다

/**
 * 저장된 목록. `{ [브랜드]: { at, amount, rule } }`.
 *
 * 저장소가 막혀 있거나(사생활 보호 창) 값이 깨졌으면 빈 목록이다 - 숨기기는 편의
 * 기능이라, 못 읽는다고 화면이 안 뜨면 안 된다.
 */
export function readHidden(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function write(next, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장이 막혀도 이번 방문 동안은 화면 상태로 산다.
  }
  return next
}

/** 숨긴다. 그 순간의 최고 할인액과 되살리기 규칙을 같이 적는다. */
export function hideBrand(hidden, name, { amount = null, rule = NEVER, now = Date.now() } = {},
                          storage = globalThis.localStorage) {
  return write({ ...hidden, [name]: { at: now, amount, rule } }, storage)
}

/** 되살린다. */
export function showBrand(hidden, name, storage = globalThis.localStorage) {
  const next = { ...hidden }
  delete next[name]
  return write(next, storage)
}

/** 되살리기 규칙만 바꾼다. 숨긴 시점의 금액은 그대로 둔다. */
export function setRule(hidden, name, rule, storage = globalThis.localStorage) {
  const entry = hidden[name]
  if (!entry) return hidden
  return write({ ...hidden, [name]: { ...entry, rule } }, storage)
}

/**
 * 지금 이 브랜드를 숨길 것인가.
 *
 * `WHEN_BIGGER`로 숨겼는데 할인이 그때보다 커졌으면 안 숨긴다. 숨길 때 금액을 몰랐으면
 * (`amount`가 null) 커졌는지 견줄 수 없으니 계속 숨긴다.
 */
export function isHidden(hidden, name, currentAmount) {
  const entry = hidden[name]
  if (!entry) return false
  if (entry.rule !== WHEN_BIGGER) return true
  if (entry.amount == null || currentAmount == null) return true
  return currentAmount <= entry.amount
}

/** 숨긴 브랜드를 목록에서 걷어낸다. `amountOf`는 그 브랜드의 지금 최고 할인액. */
export function applyHidden(brands, hidden, amountOf) {
  if (!brands.length) return brands
  const left = brands.filter((b) => !isHidden(hidden, b.name, amountOf(b)))
  return left.length === brands.length ? brands : left
}

/** 숨겼다가 할인이 커져서 다시 보이게 된 브랜드 이름들. 화면이 그 사실을 알린다. */
export function revivedNames(brands, hidden, amountOf) {
  return brands
    .filter((b) => hidden[b.name] && !isHidden(hidden, b.name, amountOf(b)))
    .map((b) => b.name)
}
