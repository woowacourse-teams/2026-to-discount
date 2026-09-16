// 배너 캐러셀의 자리 계산. 트랙은 실제 장 앞뒤에 **여분 한 장씩**을 둔다 —
// 맨 앞에 마지막 장의 사본, 맨 뒤에 첫 장의 사본. 그래서 양 끝에서도 옆으로
// 밀 수 있고(사용자 지적 2026-09-16: 끝에서 스와이프가 안 됐다), 사본에
// 멈추면 같은 내용의 실제 장으로 소리 없이 옮긴다. 캐러셀이 흔히 쓰는
// 방식이다(무한 루프의 "클론 슬라이드").
//
//   트랙 칸(slot):  0        1 … count        count+1
//   내용:           last     b0 … b(count-1)  b0
//
// 장이 하나면 사본을 안 둔다 — 넘길 것이 없다.

/** 트랙에 깔 순서. */
export function withSentinels(banners) {
  if (banners.length < 2) return banners
  return [banners[banners.length - 1], ...banners, banners[0]]
}

/** 트랙 칸 -> 실제 장 번호. */
export function slotToIndex(slot, count) {
  if (count < 2) return 0
  return (slot - 1 + count) % count
}

/** 실제 장 번호 -> 트랙 칸. */
export function indexToSlot(index, count) {
  return count < 2 ? index : index + 1
}

/** 사본 칸에 멈췄을 때 옮겨 갈 실제 칸. 사본이 아니면 null. */
export function settleSlot(slot, count) {
  if (count < 2) return null
  if (slot === 0) return count
  if (slot === count + 1) return 1
  return null
}
