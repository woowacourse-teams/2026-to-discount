/**
 * 숨긴 브랜드 목록. 정렬바 오른쪽의 "숨긴 목록" 버튼이 연다.
 *
 * 처음에는 화면 오른쪽 아래에 떠 있는 알약이었는데 하단 배너와 겹쳤다(2026-09-24
 * 사용자). 숨기기는 정렬과 다른 일이라 정렬바 안에서 오른쪽 끝에 따로 선다.
 *
 * 목록에서 브랜드마다 두 가지를 고른다. 바로 되살리거나, "할인이 커지면 다시"로
 * 두거나. 숨길 때 기본은 후자다 - 싫어서 숨긴 것과 "지금은 안 좋아서" 숨긴 것이
 * 다르고, 대부분은 후자다.
 */
import { NEVER, WHEN_BIGGER } from './hiddenBrands.js'

export default function HiddenBrandsSheet({ hidden, revived = [], onClose, onShow, onRule }) {
  const names = Object.keys(hidden)
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
