/**
 * 오늘 인기 띠(2026-10-14 시안). 카테고리와 검색을 뺀 나머지 필터를 건 목록에서 최근 24시간 동안 링크나 배너를
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
 * 오늘 순위 상위 다섯. 집계는 24시간(popularityToday), 등락은 갱신 주기다 — change는 직전 갱신 때의 순위
 * (popularityPrevious)와의 차이다(2026-10-20 사용자). 갱신마다 새로 재서 순위가 그대로면 등락이 사라진다.
 * 양수면 올랐다, 0이면 그대로. 변동은 공동 순위가 차지한 칸 수를 빼고 센다(1,2,2,3 꼴) - 클릭 1명짜리
 * 공동 순위가 길게 늘어서 18계단씩 오른 것처럼 보였다(2026-10-19 사용자, CU 1명 -> 4명).
 * 직전 20위 밖은 21위로 친다. 직전에 클릭이 없던 브랜드는 null(새로 듦).
 * API가 popularityPrevious를 아직 안 주면(옛 서버) 등락을 0으로 둔다 — 전부 새로 든 것으로 보이면 안 된다.
 */
export function popularToday(brands) {
  const known = (brands ?? []).some((b) => b.popularityPrevious != null)
  const before = denseRanks(brands, 'popularityPrevious')
  const now = denseRanks(brands, 'popularityToday')
  return [...ranks(brands, 'popularityToday')].slice(0, STRIP_SIZE).map(([name, rank]) => {
    // 직전에 클릭이 아예 없던 브랜드는 숫자 없이 '새로 듦'(null). 21위로 쳤더니 ▲18이 떴다(2026-10-19 노랑통닭)
    const prev = before.get(name)
    const change = !known ? 0 : prev == null ? null : Math.min(prev, OUTSIDE) - now.get(name)
    return { brand: (brands ?? []).find((b) => b.name === name), rank, change }
  })
}

/** 같은 값은 같은 순위, 다음 값은 바로 다음 순위(1, 2, 2, 3). */
function denseRanks(brands, key) {
  const values = [...new Set((brands ?? []).map((b) => b[key] ?? 0).filter((v) => v > 0))].sort((a, b) => b - a)
  return new Map((brands ?? []).filter((b) => (b[key] ?? 0) > 0).map((b) => [b.name, values.indexOf(b[key]) + 1]))
}

/**
 * 카드 왼쪽 위 순번(2026-10-18 사용자). 순위는 도크와 같은 rankBrands 표에서 읽고, 지금 보이는 카드에만 붙인다(#147).
 * 인기순이면 전부, 그 밖에는 맨 앞에 HOT 순위권을 세웠을 때만 그 브랜드들(카테고리를 고르면 그 안에 있는 것만).
 */
export function cardRanks(rankBrands, visibleBrands, byPopularity) {
  if (!visibleBrands) return null
  const shown = new Set(visibleBrands.map((b) => b.name))
  const pick = (entries) => new Map([...entries].filter(([name]) => shown.has(name)))
  if (byPopularity) return pick(ranks(rankBrands, 'popularityToday'))
  const top = popularToday(rankBrands)
  const lead = top.find((r) => shown.has(r.brand.name))
  return top.length >= STRIP_MIN && lead && visibleBrands[0].name === lead.brand.name ? pick(top.map((r) => [r.brand.name, r.rank])) : null
}
