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
