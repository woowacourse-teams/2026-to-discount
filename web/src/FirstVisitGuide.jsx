import { useEffect, useLayoutEffect, useState } from 'react'
import { useBackClose } from './backClose.js'
import { track } from './analytics.js'
import { guideSteps, markGuideSeen } from './firstVisitGuide.js'

// 첫 방문 안내. 자리를 selector로 찾아 그 둘레만 밝히고 아래나 위에 설명을 띄운다.
// 못 찾은 자리(목록이 비었거나 바 모양이 다른 안)는 단계째 건너뛴다. 뒤로 버튼은 건너뛰기와 같다.
export default function FirstVisitGuide({ arm, onClose }) {
  const [steps, setSteps] = useState(null)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    const found = guideSteps(arm).filter((s) => document.querySelector(s.selector))
    if (found.length === 0) { onClose(); return }
    markGuideSeen()
    setSteps(found)
    track('first_guide', { action: 'view', step: found[0].key, arm })
  }, [arm]) // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps?.[i]
  useLayoutEffect(() => {
    if (!step) return undefined
    const el = document.querySelector(step.selector)
    if (!el) { setRect(null); return undefined }
    // 바 안의 자리는 고정이라 그대로, 목록 쪽은 가운데로 끌어온다
    if (!el.closest('.title-bar')) el.scrollIntoView({ block: 'center' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure) }
  }, [step])

  const finish = (action) => {
    track('first_guide', { action, step: step?.key, arm })
    onClose()
  }
  useBackClose(Boolean(steps), () => finish('skip'))

  if (!step || !rect) return null
  const last = i === steps.length - 1
  const pad = 6
  const below = rect.top + rect.height / 2 < window.innerHeight / 2
  return (
    <div className="fvg" role="dialog" aria-modal="true" aria-label="처음 오셨나요? 화면 안내">
      <div className="fvg-hole" aria-hidden="true"
           style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div className="fvg-tip" style={below ? { top: rect.bottom + pad + 10 } : { bottom: window.innerHeight - rect.top + pad + 10 }}>
        <p className="fvg-tip__text">{step.text}</p>
        <div className="fvg-tip__row">
          <span className="fvg-tip__count">{i + 1} / {steps.length}</span>
          {!last && <button type="button" className="fvg-tip__skip" onClick={() => finish('skip')}>건너뛰기</button>}
          <button type="button" className="fvg-tip__next" autoFocus
                  onClick={() => (last ? finish('done') : setI(i + 1))}>
            {last ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  )
}
