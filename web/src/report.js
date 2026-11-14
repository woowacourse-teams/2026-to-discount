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

// 내 제보 처리 상태(설계 311). key는 API(ReportLedger.STATUSES)와 같아야 한다 — report.test.js가 대조한다.
// 라벨은 셋(2026-11-14 사용자): 반영(applied)과 반영 안 함(declined)은 둘 다 "처리됨".
export const REPORT_STATUSES = [
  { key: 'received', label: '접수됨' },
  { key: 'reviewing', label: '확인됨' },
  { key: 'applied', label: '처리됨' },
  { key: 'declined', label: '처리됨' },
]
export const MY_REPORTS_TITLE = '제보 내역'

// 이 브라우저의 제보 목록. 실패와 빈 목록을 구분한다: { ok: true, reports } | { ok: false }.
// visitorId는 주소가 아니라 헤더로만 보낸다(접근 기록에 남기지 않기 위함).
export async function fetchMyReports(visitorId, apiBase, fetchImpl = fetch) {
  if (!visitorId) return { ok: false }
  try {
    const res = await fetchImpl(`${apiBase}/api/reports/mine`, { headers: { 'X-Visitor-Id': visitorId }, cache: 'no-store' })
    if (!res.ok) return { ok: false }
    const body = await res.json()
    return Array.isArray(body?.reports) ? { ok: true, reports: body.reports } : { ok: false }
  } catch { return { ok: false } }
}

// 서울 시각 기준 yy-MM-dd(2026-11-14 사용자)
export function reportDate(at) {
  const t = new Date(at)
  if (Number.isNaN(t.getTime())) return ''
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(t).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
