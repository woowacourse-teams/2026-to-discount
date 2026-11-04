import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FOLLOW_UP, PMF_OPTIONS, PMF_QUESTION, validDraft, canAdvanceQuestion } from './pmfSurvey.js'

let openDialogs = 0
let originalScroll

function Dialog({ children, label, onClose, busy = false, className = '', inactive = false }) {
  const ref = useRef(null)
  const contentRef = useRef(null)
  const latest = useRef(onClose)
  latest.current = onClose
  useEffect(() => {
    const style = document.body.style
    if (openDialogs++ === 0) {
      originalScroll = { overflow: style.overflow, paddingRight: style.paddingRight }
      const bar = window.innerWidth - document.documentElement.clientWidth
      style.overflow = 'hidden'
      if (bar > 0) style.paddingRight = `${bar}px`
      document.body.classList.add('has-pmf-modal')
    }
    return () => {
      if (--openDialogs === 0) {
        document.body.classList.remove('has-pmf-modal')
        style.overflow = originalScroll.overflow
        style.paddingRight = originalScroll.paddingRight
      }
    }
  }, [])
  useEffect(() => {
    if (inactive) return
    const previous = document.activeElement
    ref.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [inactive])
  useLayoutEffect(() => {
    const node = ref.current
    const content = contentRef.current
    function resize() {
      const style = getComputedStyle(node)
      const frame = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      node.style.height = `${content.offsetHeight + frame}px`
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const node = ref.current
    function fit() {
      const viewport = window.visualViewport
      const height = viewport?.height || window.innerHeight
      const width = viewport?.width || window.innerWidth
      // 가장 긴 문항 기준 배율을 공유해 문항 전환 때 가로폭이 변하지 않게 한다.
      const form = node.querySelector('.pmf-form')
      let fitHeight = node.offsetHeight
      if (form) {
        const optionCount = form.querySelectorAll('.pmf-option').length
        const missingRows = Number(form.dataset.maxOptions) - optionCount
        const otherSpace = form.classList.contains('pmf-form--other') ? 0 : 88
        const style = getComputedStyle(node)
        const frame = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
          + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
        fitHeight = contentRef.current.offsetHeight + frame + missingRows * 50 + otherSpace
      }
      const scale = Math.min(1, Math.max(1, height - 76) / fitHeight, Math.max(1, width - 32) / node.offsetWidth)
      node.style.setProperty('--pmf-scale', String(scale))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(node)
    window.addEventListener('resize', fit)
    window.visualViewport?.addEventListener('resize', fit)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit) }
  }, [])
  return createPortal(<div className={`pmf-scrim${inactive ? ' pmf-scrim--inactive' : ''}`} aria-hidden={inactive || undefined}
    onClick={e => { if (e.target === e.currentTarget && !busy && !inactive) latest.current() }}>
    <section ref={ref} className={`pmf-modal ${className}`} role="dialog" aria-modal={inactive ? undefined : true}
      inert={inactive ? '' : undefined} aria-labelledby={label} tabIndex={-1}
      onKeyDown={e => {
        if (inactive) return
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) latest.current() }
        if (e.key === 'Tab') {
          const items = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')]
          const first = items[0], last = items.at(-1)
          if (!first) { e.preventDefault(); return }
          if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus() }
          else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus() }
        }
      }}><div ref={contentRef} className="pmf-dialog-content">{children}</div></section>
  </div>, document.body)
}

export default function SurveyCard({ survey }) {
  const { draft, setDraft, busy, confirmClose } = survey
  const [step, setStep] = useState(0)
  const formRef = useRef(null)
  const previousPositions = useRef({})
  const questions = [{ id: 'choice', title: PMF_QUESTION, options: PMF_OPTIONS }, ...FOLLOW_UP]
  const question = questions[step]
  const selected = draft[question.id]
  const progress = step + (selected ? 1 : 0)
  const otherText = draft[`${question.id}_text`] || ''
  const canContinue = canAdvanceQuestion(question, draft)
  useLayoutEffect(() => {
    const form = formRef.current
    if (!form) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const selector of ['.pmf-heading', '.pmf-options', '.pmf-footer']) {
      const element = form.querySelector(selector)
      const top = element.offsetTop
      const previous = previousPositions.current[selector]
      if (!reducedMotion && previous !== undefined && previous !== top) {
        element.animate([
          { transform: `translateY(${previous - top}px)` },
          { transform: 'translateY(0)' },
        ], { duration: 260, easing: 'ease' })
      }
      previousPositions.current[selector] = top
    }
  }, [step, selected === 'other'])
  useEffect(() => { survey.interact('question_viewed', { question: question.id, step: step + 1 }) }, [step, survey.interact])
  function pick(value) { survey.interact('option_selected', { question: question.id, step: step + 1, value }); setDraft(d => ({ ...d, [question.id]: value })) }
  function advance() {
    if (!canContinue || busy) return
    survey.interact(step < questions.length - 1 ? 'next_clicked' : 'submit_step_clicked', { question: question.id, step: step + 1 })
    if (step < questions.length - 1) setStep(step + 1)
    else if (validDraft(draft)) survey.submit()
  }
  return <>
    {survey.isCardOpen && <Dialog label="pmf-title" onClose={survey.requestClose} busy={busy} inactive={confirmClose}>
      <button className="pmf-x" type="button" aria-label="설문 닫기" disabled={busy} onClick={() => survey.requestClose('card')}>×</button>
      <form ref={formRef} data-max-options={Math.max(...questions.map(q => q.options.length))} className={`pmf-form${selected === 'other' ? ' pmf-form--other' : ''}`} onSubmit={e => { e.preventDefault(); advance() }}>
        <div className="pmf-progress-group">
        <div className="pmf-progress" role="progressbar" aria-label="설문 진행" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={progress}>
          <span style={{ width: `${progress / questions.length * 100}%` }} />
        </div>
        <span className="pmf-progress-count" aria-hidden="true">{step + 1}/{questions.length}</span>
        </div>
        <div key={`heading-${step}`} className="pmf-heading">
          <h2 id="pmf-title" aria-live="polite">{question.title}</h2>
        </div>
        <div key={question.id} role="radiogroup" aria-label={question.title} className="pmf-options">
          {question.options.map(([value, label]) => <label key={value} className={selected === value ? 'pmf-option is-selected' : 'pmf-option'}>
            <input type="radio" disabled={busy} name={question.id} value={value} checked={selected === value} onChange={() => pick(value)} />
            <span>{label}</span>
          </label>)}
        </div>
        <div className="pmf-other-slot">
        {selected === 'other' && <label className="pmf-other">직접 입력
          <textarea disabled={busy} maxLength={200} value={otherText} onChange={e => setDraft(d => ({ ...d, [`${question.id}_text`]: e.target.value }))} />
          <span>{otherText.length}/200</span>
        </label>}
        </div>
        <div className="pmf-footer">
          <div className="pmf-error-slot">{survey.error && <p role="alert" className="pmf-error">{survey.error}</p>}</div>
          <div className={`pmf-navigation${step === 0 ? ' pmf-navigation--reserved' : ''}`} aria-hidden={step === 0 || undefined}>
            <button className="pmf-text-button" type="button" disabled={busy || step === 0} tabIndex={step === 0 ? -1 : undefined} onClick={() => {
              survey.interact('skip_clicked', { question: question.id, step: step + 1 })
              setDraft(d => ({ ...d, [question.id]: '', [`${question.id}_text`]: '' }))
              if (step < questions.length - 1) setStep(step + 1)
              else survey.submit({ ...draft, [question.id]: '', [`${question.id}_text`]: '' })
            }}>건너뛰기</button>
          </div>
          <div className="pmf-step-actions">
            {step > 0 && <button className="pmf-back" type="button" disabled={busy} onClick={() => { survey.interact('previous_clicked', { question: question.id, step: step + 1 }); setStep(step - 1) }}>이전</button>}
            <button className="pmf-submit" type="submit" disabled={busy || !canContinue}>{busy ? '저장 중…' : step < questions.length - 1 ? '다음' : '제출하기'}</button>
          </div>
          <button className="pmf-close" type="button" disabled={busy} onClick={() => survey.requestClose('card')}>닫기</button>

        </div>
      </form>
    </Dialog>}
    {confirmClose && <Dialog label="pmf-close-title" onClose={survey.cancelClose} busy={busy} className="pmf-confirm">
      <h2 id="pmf-close-title">설문을 닫으시겠습니까?</h2>
      <p>이 설문을 닫으면 다시 표시되지 않습니다.</p>
      {survey.error && <p role="alert" className="pmf-error">{survey.error}</p>}
      <div className="pmf-confirm__actions">
        <button className="pmf-close" type="button" disabled={busy} onClick={survey.cancelClose}>계속 응답하기</button>
        <button className="pmf-submit" type="button" disabled={busy} onClick={survey.dismiss}>{busy ? '저장 중…' : '설문 닫기'}</button>
      </div>
    </Dialog>}
  </>
}
