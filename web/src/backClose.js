import { useEffect, useRef } from 'react'

/** 밖에서 하위 화면(브랜드 페이지, #카드 공유 링크)으로 바로 들어왔으면 그 밑에 홈 칸을 깐다.
 *  뒤로 한 번이 사이트를 떠나지 않고 홈으로 온다(2026-10-19 사용자). public/about, privacy에도 같은 스크립트가 있다. */
export function homeUnderDirectLanding(loc = window.location, history = window.history, referrer = document.referrer) {
  let sameSite = false
  try { sameSite = new URL(referrer).origin === loc.origin } catch { /* 주소 없음 = 밖에서 옴 */ }
  if ((loc.pathname !== '/' || loc.hash) && !sameSite && !history.state) {
    const here = loc.href
    history.replaceState({ home: true }, '', '/')
    history.pushState({ landed: true }, '', here) // 새로고침해도 다시 깔지 않게
  }
  window.addEventListener('popstate', (e) => { if (e.state?.home) loc.replace('/') })
}

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

/** 메인에서 뒤로 한 번에 사이트가 꺼지지 않게 한 칸(guard)을 깐다. 뒤로가 그 칸을 지나 바닥에 닿으면
 *  "한 번 더 누르면 나가요"를 띄우고 칸을 다시 깐다. 2초 안에 또 누르면 그대로 나간다(2026-11-04 사용자).
 *  시트, 검색 등 위에 쌓인 칸(overlay)을 닫는 뒤로는 바닥에 안 닿으니 여기 걸리지 않는다. */
export function exitGuard(notify, history = window.history, now = () => Date.now()) {
  let armedAt = 0
  history.pushState({ ...history.state, guard: true }, '')
  const onPop = (e) => {
    if (e.state?.guard || e.state?.overlay) return
    if (now() - armedAt < 2000) { window.removeEventListener('popstate', onPop); history.back(); return }
    armedAt = now()
    notify('뒤로 버튼을 한 번 더 누르면 나가요')
    history.pushState({ ...history.state, guard: true }, '')
  }
  window.addEventListener('popstate', onPop)
  return () => window.removeEventListener('popstate', onPop)
}
