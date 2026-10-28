// 제보에 같이 싣는 화면 맥락: 지금 보던 주소와 고른 필터(filters.js 값 전부, Set은 쉼표로).
export const TIP_SEEN_KEY = 'dk_report_tip_seen'

// 제보 종류. key는 API(ReportController.TYPES)와 같아야 한다 — report.test.js가 대조한다.
export const REPORT_TYPES = [
  { key: 'amount', label: '할인 금액' },
  { key: 'exists', label: '할인 여부' },
  { key: 'screen', label: '화면 오류' },
  { key: 'other', label: '그 외' },
]
export const needsPlatform = (type) => type === 'amount' || type === 'exists'

export function reportContext(href, filters) {
  const parts = Object.entries(filters ?? {})
    .map(([k, v]) => [k, v instanceof Set ? [...v].join(',') : v && typeof v === 'object' ? JSON.stringify(v) : v]) // 정렬(sorts) 같은 객체가 [object Object]로 갔다
    .filter(([, v]) => v !== '' && v !== false && v != null)
    .map(([k, v]) => `${k}=${v}`)
  return { url: href, filters: parts.join(' ').slice(0, 500) }
}
