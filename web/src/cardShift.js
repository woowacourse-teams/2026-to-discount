/**
 * 카드 하나가 빠질 때 남은 카드들이 제자리로 미끄러지게 한다(FLIP).
 *
 * 목록에서 한 장을 빼면 아래 카드들이 한 칸씩 순간이동한다. 무엇이 어디로 갔는지
 * 눈이 못 따라가고, 방금 숨긴 것이 사라진 건지 다른 카드가 사라진 건지 헷갈린다.
 *
 * 방법은 FLIP이다. 빼기 전 자리를 재고(First), 뺀 뒤 자리를 재고(Last), 그 차이만큼
 * 거꾸로 밀어 놓은 다음(Invert) 0으로 전환한다(Play). 브라우저는 새 자리에 이미
 * 그려 놓았고 우리는 그 위에서 옛 자리부터 되감는 것이라, 레이아웃을 애니메이션
 * 하지 않아 끊기지 않는다.
 */

/** 지금 카드들의 자리. `{ [키]: {x, y} }` */
export function captureRects(cards) {
  const out = {}
  for (const { key, rect } of cards) out[key] = { x: rect.left, y: rect.top }
  return out
}

/**
 * 옛 자리와 새 자리의 차이. 움직인 카드만 담는다.
 *
 * 1px 미만은 버린다. 스크롤바나 반올림으로 늘 조금씩 흔들리는데, 그걸 전부
 * 애니메이션하면 목록 전체가 떨린다.
 */
export function shiftsBetween(first, cards, minPx = 1) {
  const out = []
  for (const { key, rect } of cards) {
    const was = first[key]
    if (!was) continue
    const dx = was.x - rect.left
    const dy = was.y - rect.top
    if (Math.abs(dx) < minPx && Math.abs(dy) < minPx) continue
    out.push({ key, dx, dy })
  }
  return out
}

/** 브라우저에서 카드 목록을 읽는다. 키는 카드가 들고 있는 `data-brand`다. */
export function readCards(container) {
  if (!container) return []
  return [...container.querySelectorAll('[data-brand]')]
    .map((el) => ({ key: el.dataset.brand, el, rect: el.getBoundingClientRect() }))
}

/**
 * 옛 자리로 되감았다가 제자리로 보낸다.
 *
 * @param duration 밀리초. 0이면 아무것도 안 한다(움직임을 줄이라고 한 사람).
 */
export function playShift(container, first, duration = 260) {
  if (!container || duration <= 0) return 0
  const cards = readCards(container)
  const moves = shiftsBetween(first, cards)
  if (!moves.length) return 0
  const byKey = new Map(cards.map((c) => [c.key, c.el]))
  for (const { key, dx, dy } of moves) {
    const el = byKey.get(key)
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px)`
  }
  // 되감은 상태를 한 번 그리게 한 뒤에 풀어야 전환이 걸린다.
  container.getBoundingClientRect()
  for (const { key } of moves) {
    const el = byKey.get(key)
    el.style.transition = `transform ${duration}ms cubic-bezier(.2, .8, .2, 1)`
    el.style.transform = ''
  }
  window.setTimeout(() => {
    for (const { key } of moves) {
      const el = byKey.get(key)
      if (el) { el.style.transition = ''; el.style.transform = '' }
    }
  }, duration + 40)
  return moves.length
}
