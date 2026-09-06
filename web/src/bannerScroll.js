// 배너 캐러셀에서 다른 장으로 옮길 때 미끄러질지 갈아끼울지 정한다.
//
// 두 번 같은 자리에서 깨졌다 — 마지막 장에서 처음으로 돌 때, 그리고 점으로
// 멀리 있는 장을 누를 때. 둘 다 smooth로 두면 사이에 낀 배너를 전부 훑고
// 지나가서 뒤로 가는 것처럼 보인다. 규칙은 하나다: 옆 장만 미끄러진다.
export function jumpBehavior(cur, next) {
  return Math.abs(next - cur) === 1 ? 'smooth' : 'instant'
}
