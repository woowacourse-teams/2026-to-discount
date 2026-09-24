/**
 * 숨기기 확인 창. 바로 숨기지 않고 어떻게 숨길지 고르게 한다.
 *
 * 두 가지가 다르다. 싫어서 다시 안 볼 브랜드와, 지금 할인이 시원찮아 잠깐 치워 둘
 * 브랜드. 후자를 영영 숨기면 나중에 좋은 할인이 떠도 못 본다. 그래서 기본값을 주지
 * 않고 매번 고르게 한다(사용자 2026-09-24).
 *
 * 문구는 개발자가 정한 것을 그대로 쓴다(COPY-STYLE 3).
 */
import { useEffect } from 'react'
import { NEVER, WHEN_BIGGER } from './hiddenBrands.js'

export default function HideBrandAsk({ brand, amount, onChoose, onCancel }) {
  // 바깥을 누르면 취소다. 되돌릴 수 없는 일이 아니라 물러날 길이 넓어야 한다.
  // Esc도 같이 받는다 - 이 창은 role="dialog"라 키보드로도 닫혀야 한다.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="hide-ask"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hide-ask-title"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="hide-ask__box">
        <p className="hide-ask__title" id="hide-ask-title">
          {brand}를 숨기시겠어요?
        </p>
        <p className="hide-ask__desc">완전히 숨기거나, 업데이트 전까지 숨길 수 있어요.</p>

        <div className="hide-ask__acts">
          <button
            type="button"
            className="hide-ask__keep"
            onClick={() => onChoose(WHEN_BIGGER)}
          >
            업데이트 전까지 숨기기
            {amount != null && (
              <span className="hide-ask__hint">지금 {amount.toLocaleString()}원보다 커지면 다시 보여요</span>
            )}
          </button>
          <button type="button" className="hide-ask__drop" onClick={() => onChoose(NEVER)}>
            완전히 숨기기
          </button>
          <button type="button" className="hide-ask__cancel" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
