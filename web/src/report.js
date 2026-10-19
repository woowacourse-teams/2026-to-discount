// 제보에 같이 싣는 화면 맥락: 지금 보던 주소와 고른 필터(filters.js 값 전부, Set은 쉼표로).
export const TIP_SEEN_KEY = 'dk_report_tip_seen'

export function reportContext(href, filters) {
  const parts = Object.entries(filters ?? {})
    .map(([k, v]) => [k, v instanceof Set ? [...v].join(',') : v])
    .filter(([, v]) => v !== '' && v !== false && v != null)
    .map(([k, v]) => `${k}=${v}`)
  return { url: href, filters: parts.join(' ').slice(0, 500) }
}
