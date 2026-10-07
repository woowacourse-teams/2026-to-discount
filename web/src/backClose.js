import { useEffect, useRef } from 'react'

/** 열린 동안 방문 기록에 한 칸을 쌓아, 폰의 뒤로 버튼이 창을 떠나지 않고 이 화면(시트, 검색)만 닫게 한다(2026-10-07 사용자).
 *  다른 방법(닫기 단추, 바깥 누르기)으로 닫히면 쌓았던 칸을 되돌린다. */
export function useBackClose(open, close) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    window.history.pushState({ ...window.history.state, overlay: true }, '')
    const onPop = () => closeRef.current()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (window.history.state?.overlay) window.history.back()
    }
  }, [open])
}
