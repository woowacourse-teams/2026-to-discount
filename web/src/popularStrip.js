/**
 * 오늘 인기 띠(2026-10-14 시안). 지금 목록에 남은 브랜드 중 최근 24시간 동안 링크나 배너를
 * 누른 사람이 많은 순으로 다섯(API popularityToday, PopularityIndex). 누르면 그 카드로 간다.
 * 세 곳이 안 되면 그리지 않는다 - 하루 클릭이 적은 새벽에는 순위가 의미가 없다.
 */
export const STRIP_SIZE = 5
export const STRIP_MIN = 3

/** key 값이 0보다 큰 브랜드를 많은 순으로 세운 순위표. 이름 → 1부터 센 순위. */
export function ranks(brands, key) {
  return new Map([...(brands ?? [])]
    .filter((b) => (b[key] ?? 0) > 0)
    .sort((a, b) => b[key] - a[key])
    .map((b, i) => [b.name, i + 1]))
}

/**
 * 오늘 순위 상위 다섯. change는 그 전 24시간(popularityYesterday) 순위와의 차이다.
 * 양수면 올랐다, 0이면 그대로, null이면 그 전 24시간 순위에 없던 브랜드다.
 */
export function popularToday(brands) {
  const before = ranks(brands, 'popularityYesterday')
  return [...ranks(brands, 'popularityToday')].slice(0, STRIP_SIZE).map(([name, rank]) => {
    const prev = before.get(name)
    return { brand: (brands ?? []).find((b) => b.name === name), rank, change: prev == null ? null : prev - rank }
  })
}
