// 제보 시트의 내 제보 목록(설계 311). 그리기 전용: 읽기는 ReportButton이 한다.
import { MY_REPORTS_TITLE, REPORT_STATUSES, REPORT_TYPES, reportDate } from './report.js'

export default function MyReports({ reports }) {
  if (!Array.isArray(reports) || reports.length === 0) return null
  return (
    <section className="my-reports">
      <h3 className="my-reports__title">{MY_REPORTS_TITLE}</h3>
      <ul className="my-reports__list">
        {reports.map((r) => (
          <li key={r.id} className="my-reports__row">
            <span className="my-reports__what">
              {[REPORT_TYPES.find((t) => t.key === r.type)?.label, r.brand, reportDate(r.at)].filter(Boolean).join(' · ')}
            </span>
            <span className="my-reports__status">{REPORT_STATUSES.find((s) => s.key === r.status)?.label ?? ''}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
