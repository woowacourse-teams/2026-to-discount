import { PlatformBadge } from './logos.jsx'
import { PLATFORMS } from './platforms.js'

// 할인 기록을 앱별로 본다. value가 null이면 전체(모든 앱 중 최고). 앱은 글자 대신 로고로 보인다(2026-11-19 사용자).
export default function HistoryPlatformChips({ value, onChange, className, chipClassName }) {
  return (
    <div className={className} role="group" aria-label="앱">
      <button type="button" className={chipClassName} aria-pressed={value === null} onClick={() => onChange(null)}>전체</button>
      {PLATFORMS.map(({ key }) => (
        <span key={key} data-k={key} style={{ display: 'contents' }}>
          <PlatformBadge platformKey={key} active={value === key} onClick={() => onChange(key)} />
        </span>
      ))}
    </div>
  )
}
