import { PLATFORMS } from './platforms.js'

// 할인 기록을 앱별로 본다. value가 null이면 전체(모든 앱 중 최고). 칩 모양은 부르는 쪽 클래스를 쓴다.
export default function HistoryPlatformChips({ value, onChange, className, chipClassName }) {
  return (
    <div className={className} role="group" aria-label="앱">
      {[{ key: null, label: '전체' }, ...PLATFORMS].map(({ key, label }) => (
        <button key={key ?? 'all'} type="button" className={chipClassName} aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  )
}
