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
import { BrandLogo } from './logos.jsx'

export default function HiddenBrandsSheet({ hidden, revived = [], open, onClose, onShow, onRule }) {
  const names = Object.keys(hidden)
  // 닫혀 있어도 DOM에 남긴다. 붙였다 뗐다 하면 높이를 잴 수 없어 펼치는 동작이
  // 한 칸 튀어 버린다. 여닫기는 CSS 전환이 맡는다.
  return (
    <div className={`hidden-wrap${open ? ' hidden-wrap--open' : ''}`} aria-hidden={!open}>
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
          const bigger = hidden[name].rule === WHEN_BIGGER
          const amount = hidden[name].amount
          return (
            <li key={name} className="hidden-sheet__row">
              <p className="hidden-sheet__line">
                <BrandLogo name={name} />
                <span className="hidden-sheet__name">{name}</span>
                <span className="hidden-sheet__amount">
                  {amount != null ? `${amount.toLocaleString()}원` : '금액 미확인'}
                </span>
              </p>

              {/* 두 선택지가 하나를 고르는 관계다. 홈 안에서 알약이 미끄러져 옮겨
                  가야 "바뀌었다"가 아니라 "옮겼다"로 읽힌다. */}
              <div className="seg" data-on={bigger ? 'bigger' : 'never'}>
                <span className="seg__thumb" aria-hidden="true" />
                <button
                  type="button"
                  className="seg__opt"
                  aria-pressed={!bigger}
                  onClick={() => onRule(name, NEVER)}
                >
                  완전히 숨기기
                </button>
                <button
                  type="button"
                  className="seg__opt"
                  aria-pressed={bigger}
                  onClick={() => onRule(name, WHEN_BIGGER)}
                >
                  변경시 보이기
                </button>
              </div>

              <button type="button" className="hidden-sheet__undo" onClick={() => onShow(name)}>
                숨기기 취소
              </button>
            </li>
          )
        })}
      </ul>
    </div>
    </div>
  )
}
