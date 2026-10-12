import { useEffect, useLayoutEffect, useState } from 'react'
import { useBackClose } from './backClose.js'
import { track } from './analytics.js'
import { guideSteps, markGuideSeen } from './firstVisitGuide.js'

// 첫 방문 안내. 자리를 selector로 찾아 그 둘레만 밝히고 아래나 위에 설명을 띄운다.
// 못 찾은 자리(목록이 비었거나 바 모양이 다른 안)는 단계째 건너뛴다. 뒤로 버튼은 건너뛰기와 같다.
// 안내 중엔 스크롤을 잠근다. 자리는 짧은 간격으로 다시 찾아 잰다 — 쿠폰 카드는 지연 로드라
// 처음 잡은 요소(대체 카드)가 바뀌어 끼워지고, 옛 요소를 쥐고 있으면 밝힌 자리가 사라졌다(2026-10-13 실측).
// ponytail: 250ms 다시 찾기. 단계가 늘거나 자리가 자주 움직이면 MutationObserver로.
const lockScroll = (e) => { if (!e.target.closest?.('.fvg-tip')) e.preventDefault() }

export default function FirstVisitGuide({ arm, onClose }) {
  const [steps, setSteps] = useState(null)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    const found = guideSteps(arm).filter((s) => document.querySelector(s.selector))
    if (found.length === 0) { onClose(); return undefined }
    markGuideSeen()
    setSteps(found)
    track('first_guide', { action: 'view', step: found[0].key, arm })
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    document.addEventListener('touchmove', lockScroll, { passive: false })
    document.addEventListener('wheel', lockScroll, { passive: false })
    return () => {
      root.style.overflow = prev
      document.removeEventListener('touchmove', lockScroll)
      document.removeEventListener('wheel', lockScroll)
    }
  }, [arm]) // eslint-disable-line react-hooks/exhaustive-deps

  const step = steps?.[i]
  useLayoutEffect(() => {
    if (!step) return undefined
    const el = document.querySelector(step.selector)
    // 바 안의 자리는 고정이라 그대로, 목록 쪽은 가운데로 끌어온다(잠금 중에도 코드 스크롤은 된다)
    if (el && !el.closest('.title-bar')) el.scrollIntoView({ block: 'center' })
    const measure = () => {
      const r = document.querySelector(step.selector)?.getBoundingClientRect()
      setRect((old) => (r && r.width > 0 ? (old && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height ? old : r) : null))
    }
    measure()
    const id = setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => { clearInterval(id); window.removeEventListener('resize', measure) }
  }, [step])

  const finish = (action) => {
    track('first_guide', { action, step: step?.key, arm })
    onClose()
  }
  useBackClose(Boolean(steps), () => finish('skip'))

  if (!step || !rect) return null
  const last = i === steps.length - 1
  const pad = 6
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  // 화면 밖으로 넘친 자리(좁은 폭의 바 끝)는 화면 안으로 잘라 밝힌다
  const top = Math.max(rect.top - pad, 2)
  const left = Math.max(rect.left - pad, 2)
  const right = Math.min(rect.right + pad, vw - 2)
  const bottom = Math.min(rect.bottom + pad, vh - 2)
  const below = (top + bottom) / 2 < vh / 2
  const go = (n, action) => { track('first_guide', { action, step: steps[n].key, arm }); setI(n) }
  return (
    <div className="fvg" role="dialog" aria-modal="true" aria-label="처음 오셨나요? 화면 안내" tabIndex={-1} ref={(n) => n && !n.contains(document.activeElement) && n.focus({ preventScroll: true })}>
      <div className="fvg-hole" aria-hidden="true" style={{ top, left, width: right - left, height: bottom - top }} />
      <div className="fvg-tip" style={below ? { top: bottom + 10 } : { bottom: vh - top + 10 }}>
        <p className="fvg-tip__text">{step.text}</p>
        <div className="fvg-tip__row">
          <span className="fvg-tip__count">{i + 1} / {steps.length}</span>
          {!last && <button type="button" className="fvg-tip__skip" onClick={() => finish('skip')}>건너뛰기</button>}
          {/* 이전/다음은 빠른 정렬과 같은 한 홈 모양(quick-bar__sorts) */}
          <div className="quick-bar__sorts fvg-tip__nav" role="group" aria-label="안내 넘기기">
            <button type="button" className="quick-bar__chip" disabled={i === 0} onClick={() => go(i - 1, 'prev')}>이전</button>
            <button type="button" className="quick-bar__chip quick-bar__chip--on"
                    onClick={() => (last ? finish('done') : go(i + 1, 'next'))}>
              {last ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
