/**
 * 오늘 인기 띠(2026-10-14 시안). 지금 목록에 남은 브랜드 중 최근 24시간 동안 링크나 배너를
 * 누른 사람이 많은 순으로 다섯(API popularityToday, PopularityIndex). 누르면 그 카드로 간다.
 * 세 곳이 안 되면 그리지 않는다 - 하루 클릭이 적은 새벽에는 순위가 의미가 없다.
 */
export const STRIP_SIZE = 5
export const STRIP_MIN = 3
const OUTSIDE = 21 // 어제 순위는 20위까지만 센다

/**
 * key 값이 0보다 큰 브랜드를 많은 순으로 세운 순위표. 이름 → 순위.
 * 같은 값이면 같은 순위다(1, 2, 2, 4). 목록 순서로 동점을 가르면 띠와 카드 목록이
 * 서로 다른 순위를 보였다(2026-10-14, 토핑몬스터피자와 교촌치킨 둘 다 7명).
 */
export function ranks(brands, key) {
  const sorted = [...(brands ?? [])].filter((b) => (b[key] ?? 0) > 0).sort((a, b) => b[key] - a[key])
  const out = new Map()
  sorted.forEach((b, i) => out.set(b.name, i > 0 && sorted[i - 1][key] === b[key] ? out.get(sorted[i - 1].name) : i + 1))
  return out
}

/**
 * 오늘 순위 상위 다섯. change는 그 전 24시간(popularityYesterday) 순위와의 차이다.
 * 양수면 올랐다, 0이면 그대로. 어제 20위 밖(순위 없음 포함)은 모두 21위로 친다 - 클릭 1명짜리 공동 순위가
 * 길게 늘어서 18계단씩 오른 것처럼 보였다(2026-10-19 사용자, CU 1명 -> 4명).
 */
export function popularToday(brands) {
  const before = ranks(brands, 'popularityYesterday')
  return [...ranks(brands, 'popularityToday')].slice(0, STRIP_SIZE).map(([name, rank]) => {
    const prev = Math.min(before.get(name) ?? OUTSIDE, OUTSIDE)
    return { brand: (brands ?? []).find((b) => b.name === name), rank, change: prev - rank }
  })
}
