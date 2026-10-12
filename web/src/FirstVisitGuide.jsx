import { useEffect, useLayoutEffect, useState } from 'react'
import { useBackClose } from './backClose.js'
import { track } from './analytics.js'
import { guideSteps, markGuideSeen } from './firstVisitGuide.js'

// 첫 방문 안내. 자리를 selector로 찾아 그 둘레만 밝히고 아래나 위에 설명을 띄운다.
// 못 찾은 자리(목록이 비었거나 바 모양이 다른 안)는 단계째 건너뛴다. 뒤로 버튼은 건너뛰기와 같다.
// 안내 중엔 스크롤을 잠근다. 자리는 짧은 간격으로 다시 찾아 잰다 — 쿠폰 카드는 지연 로드라
// 처음 잡은 요소(대체 카드)가 바뀌어 끼워지고, 옛 요소를 쥐고 있으면 밝힌 자리가 사라졌다(2026-10-13 실측).
// ponytail: 250ms 다시 찾기. 단계가 늘거나 자리가 자주 움직이면 MutationObserver로.
// 개발 모드 StrictMode는 마운트를 두 번 한다. view는 페이지당 한 번만 센다.
// 움직임 줄이기를 켠 사람에겐 바로 옮긴다
const scrollBehavior = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
let viewSent = false
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
    if (!viewSent) track('first_guide', { action: 'view', step: found[0].key, index: 1, total: found.length, arm })
    viewSent = true
    const root = document.documentElement
    // 뜨기 전에 내려 둔 자리 그대로 잠기면 안내가 엉뚱한 화면 위에 뜬다. 맨 위로 되돌린 뒤 잠근다.
    window.scrollTo(0, 0)
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
    if (el && !el.closest('.title-bar')) el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
    // 큰 자리 하나와, 그 안에서 따로 짚는 자리들(marks: 버튼, 자세히 보기). 값이 같으면 다시 그리지 않는다.
    const box = (r) => ({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height })
    const measure = (heal) => {
      const target = document.querySelector(step.selector)
      let r = target?.getBoundingClientRect()
      // 뜨는 순간 남은 관성 스크롤(모바일 플링)이 자리를 화면 밖으로 밀면 다시 끌어온다
      if (heal === true && r && !target.closest('.title-bar') && (r.bottom < 0 || r.top > window.innerHeight)) {
        target.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
        r = target.getBoundingClientRect()
      }
      const marks = (step.marks ?? []).flatMap((m) => {
        const e = document.querySelector(m.selector)
        const mr = e?.getBoundingClientRect()
        return mr && mr.width > 0 ? [{ ...box(mr), radius: getComputedStyle(e).borderRadius, label: m.label, side: m.side }] : []
      })
      const next = r && r.width > 0 ? { ...box(r), marks } : null
      setRect((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
    }
    measure(true)
    const id = setInterval(() => measure(true), 250)
    // 부드러운 스크롤 동안 구멍이 따라오도록 스크롤마다 잰다
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => { clearInterval(id); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure) }
  }, [step])

  const finish = (action) => {
    track('first_guide', { action, step: step?.key, index: i + 1, total: steps?.length, arm })
    onClose()
  }
  // 폰의 뒤로 버튼은 페이지를 떠나지 않고 안내만 닫는다(건너뛰기와 따로 센다)
  useBackClose(Boolean(steps), () => finish('back'))

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
  // 이전/다음은 도착한 단계로 센다. 어느 단계에서 많이 떠나는지 볼 수 있다.
  const go = (n, action) => { track('first_guide', { action, step: steps[n].key, index: n + 1, total: steps.length, arm }); setI(n) }
  return (
    <div className="fvg" role="dialog" aria-modal="true" aria-label="처음 오셨나요? 화면 안내" tabIndex={-1} ref={(n) => n && !n.contains(document.activeElement) && n.focus({ preventScroll: true })}>
      <div className="fvg-hole" aria-hidden="true" style={{ top, left, width: right - left, height: bottom - top }} />
      {rect.marks.map((m) => (
        <div key={m.label} className="fvg-mark" aria-hidden="true"
             style={{ top: m.top - 3, left: m.left - 3, width: m.width + 6, height: m.height + 6, borderRadius: `calc(${m.radius} + 3px)` }}>
          <span className={`fvg-mark__label fvg-mark__label--${m.side}`}>{m.label}</span>
        </div>
      ))}
      <div className="fvg-tip" style={below ? { top: bottom + 10 } : { bottom: vh - top + 10 }}>
        <p className="fvg-tip__text">
          {/* em 낱말(예: 버튼)은 짚은 테두리와 같은 색으로 */}
          {step.em ? step.text.split(step.em).flatMap((part, n) => (n ? [<strong key={n} className="fvg-em">{step.em}</strong>, part] : [part])) : step.text}
        </p>
        <div className="fvg-tip__row">
          <span className="fvg-tip__count">{i + 1} / {steps.length}</span>
          {!last && <button type="button" className="fvg-tip__skip" onClick={() => finish('skip')}>건너뛰기</button>}
          {/* 이전/다음: 가운데 구분선을 둔 한 덩어리 타원(세그먼트 컨트롤) */}
          <div className="fvg-seg" role="group" aria-label="안내 넘기기">
            <button type="button" disabled={i === 0} onClick={() => go(i - 1, 'prev')}>이전</button>
            <button type="button" className="fvg-seg__next"
                    onClick={() => (last ? finish('done') : go(i + 1, 'next'))}>
              {last ? '시작하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
