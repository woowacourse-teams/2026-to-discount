/**
 * 묶음 배너 한 장에 늘어설 브랜드 이름과 그 브랜드의 소진 여부.
 *
 * API가 group으로 접은 카드에는 members가 온다(2026-09-29). 카드의 soldOut은 구성원
 * 전원이 소진일 때만 참이라, 한 곳만 소진이면 그 이름만 흐리게 그린다. 전에는 대표 것
 * 하나로 카드 전체가 정해져서 다른 구성원이 소진이어도 아무 표시가 없었다(감사 #6).
 *
 * members가 없는 옛 묶음(brands 배열)은 소진을 구성원별로 모른다. 전부 false다.
 */
export function bannerMemberLabels(banner) {
  if (Array.isArray(banner.members) && banner.members.length > 1) {
    return banner.members.map((m) => ({ label: m.brandLabel ?? m.brand, soldOut: !!m.soldOut }))
  }
  const names = banner.brandLabels ?? banner.brands ?? []
  return names.map((label) => ({ label, soldOut: false }))
}
