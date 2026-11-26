// 시트·대화상자가 같이 쓰는 ESC 닫기, 뒤 스크롤 잠금, 서버 안전 layout effect.
import { useEffect, useLayoutEffect, useRef } from 'react'

// 서버 렌더에서는 layout effect가 돌지 않고 경고만 남긴다.
export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function useEscape(open, onClose) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') ref.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
}

// 잠금을 센다. 시트가 겹쳐 열리고 닫히는 순서가 엇갈려도 마지막 하나가 풀릴 때 처음 값으로 돌린다
// (저마다 열 때의 값을 기억해 되돌리면 앞 시트가 기억한 'hidden'으로 돌아가 잠금이 남는다).
let locks = 0
let saved = null
export function lockBody(style, bar = 0) {
  if (locks++ === 0) {
    saved = { overflow: style.overflow, paddingRight: style.paddingRight }
    style.overflow = 'hidden'
    // 사라진 스크롤바 폭만큼 오른쪽 여백을 채워 폭이 흔들리지 않게 한다.
    if (bar > 0) style.paddingRight = `${bar}px`
  }
  let done = false
  return () => {
    if (done) return
    done = true
    if (--locks === 0) Object.assign(style, saved)
  }
}

export function useScrollLock(open) {
  useEffect(() => {
    if (!open) return undefined
    return lockBody(document.body.style, window.innerWidth - document.documentElement.clientWidth)
  }, [open])
}

// 대화상자 포커스 가두기. Tab이 끝에서 처음으로(Shift+Tab은 반대로) 돈다.
// 돌려주는 값: null = 브라우저에 맡김, -1 = 대화상자 자체, 그 밖 = 옮길 칸 번호.
export function trapTabIndex(count, current, shift) {
  if (!count) return -1
  if (current < 0 || (shift && current === 0) || (!shift && current === count - 1)) return shift ? count - 1 : 0
  return null
}

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
// 열릴 때 primary(없으면 첫 칸, 그것도 없으면 대화상자)에 포커스를 두고, 밖으로 나간 포커스와 Tab을 안에 가둔다.
// beforeFocus는 처음 포커스를 옮기기 직전에 부른다(닫힌 뒤 돌려줄 자리를 기억하는 데 쓴다).
export function useFocusTrap(open, dialogRef, primary, beforeFocus) {
  const before = useRef(beforeFocus)
  before.current = beforeFocus
  useEffect(() => {
    if (!open) return undefined
    before.current?.()
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const focusable = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)
    const focusFirst = () => {
      ;(dialog.querySelector(primary) || focusable()[0] || dialog).focus({ preventScroll: true })
    }
    focusFirst()
    const containFocus = (event) => {
      if (!dialog.contains(event.target)) focusFirst()
    }
    const trapTab = (event) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      const to = trapTabIndex(elements.length, elements.indexOf(document.activeElement), event.shiftKey)
      if (to === null) return
      event.preventDefault()
      ;(to < 0 ? dialog : elements[to]).focus({ preventScroll: true })
    }
    document.addEventListener('focusin', containFocus)
    document.addEventListener('keydown', trapTab)
    return () => {
      document.removeEventListener('focusin', containFocus)
      document.removeEventListener('keydown', trapTab)
    }
  }, [open, dialogRef, primary])
}

// 손가락 리스너 네 개를 붙이고 떼는 함수를 돌려준다. move만 passive가 아니다(끄는 동안 기본 스크롤을 막아야 해서).
export function addTouch(el, { start, move, end }) {
  el.addEventListener('touchstart', start, { passive: true })
  el.addEventListener('touchmove', move, { passive: false })
  el.addEventListener('touchend', end)
  el.addEventListener('touchcancel', end)
  return () => {
    el.removeEventListener('touchstart', start)
    el.removeEventListener('touchmove', move)
    el.removeEventListener('touchend', end)
    el.removeEventListener('touchcancel', end)
  }
}
