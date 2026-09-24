/**
 * 숨긴 브랜드 목록. 설문 알약과 같은 자리(하단 배너 위)에 알약으로 떠 있다가,
 * 누르면 목록을 연다. 숨긴 것이 없으면 App이 아예 안 그린다.
 *
 * 목록에서 브랜드마다 두 가지를 고른다. 바로 되살리거나, "할인이 커지면 다시"로
 * 두거나. 숨길 때 기본은 후자다 - 싫어서 숨긴 것과 "지금은 안 좋아서" 숨긴 것이
 * 다르고, 대부분은 후자다(사용자 2026-09-24).
 */
import { NEVER, WHEN_BIGGER } from './hiddenBrands.js'

export default function HiddenBrandsDock({
  hidden, revived = [], raised = false, open, onOpen, onClose, onShow, onRule,
}) {
  const names = Object.keys(hidden)
  if (!open) {
    return (
      <button
        type="button"
        className={`hidden-dock${raised ? ' hidden-dock--raised' : ''}`}
        onClick={onOpen}
      >
        숨긴 목록
        <span className="hidden-dock__count">{names.length}</span>
        {revived.length > 0 && <span className="hidden-dock__dot" aria-hidden="true" />}
      </button>
    )
  }

  return (
    <div className="hidden-sheet" role="dialog" aria-modal="true" aria-label="숨긴 브랜드">
      <div className="hidden-sheet__head">
        <strong>숨긴 브랜드 {names.length}곳</strong>
        <button type="button" className="hidden-sheet__close" onClick={onClose} aria-label="닫기">×</button>
      </div>

      {revived.length > 0 && (
        <p className="hidden-sheet__note">
          {revived.join(', ')} 할인이 숨길 때보다 커져서 목록에 다시 나와 있어요.
        </p>
      )}

      <ul className="hidden-sheet__list">
        {names.map((name) => {
          const entry = hidden[name]
          const bigger = entry.rule === WHEN_BIGGER
          return (
            <li key={name} className="hidden-sheet__row">
              <span className="hidden-sheet__name">{name}</span>
              <span className="hidden-sheet__when">
                {entry.amount != null ? `${entry.amount.toLocaleString()}원일 때 숨김` : '숨김'}
              </span>
              <span className="hidden-sheet__acts">
                <button
                  type="button"
                  className={`hidden-sheet__rule${bigger ? ' hidden-sheet__rule--on' : ''}`}
                  aria-pressed={bigger}
                  onClick={() => onRule(name, bigger ? NEVER : WHEN_BIGGER)}
                >
                  할인 커지면 다시
                </button>
                <button type="button" className="hidden-sheet__show" onClick={() => onShow(name)}>
                  되살리기
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
