/**
 * 화면 안(variant). 실험은 끝났다 — 'a' 하나로 고정한다.
 *
 *   a = 한 줄 바 + 분류 캐러셀 (조건을 전부 펼쳐둔다)   ← 확정
 *   b = 두 줄 바 + 필터 바텀시트 (조건을 시트에 감춘다)  ← 내림(2026-09-15)
 *
 * <p>2026-09-09~14 반반 배정(visitorId FNV-1a 해시)으로 돌렸고, 결론은
 * docs/HANDOFF-20260914.md §4 — 시트에 감추면 조건이 걸려 있다는 사실
 * 자체를 못 보고, 펼쳐두면 그 자리에서 푼다. b 코드(FilterSheet·MenuBar·
 * 두 줄 바)는 지웠다. 되살릴 일이 있으면 그 커밋 이전에서 꺼낸다.
 *
 * <p>값을 상수로 남기는 이유: analytics가 이벤트마다 variant를 실어
 * 보내 왔고(PostHog 대시보드가 이 속성으로 가른다), 실험 전후를 한
 * 축으로 같이 보려면 이름이 그대로여야 한다. 루트 data-variant도 CSS가
 * 참조하므로 그대로 새긴다.
 */
export const uiVariant = 'a'

// 부르는 쪽(main.jsx)이 실행한다. import만으로 DOM을 건드리면 이
// 모듈이 브라우저 밖(테스트 러너)에서 못 불린다.
export function markVariantOnRoot() {
  document.documentElement.dataset.variant = uiVariant
}
