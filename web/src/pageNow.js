// 화면이 "지금"으로 치는 시각. 하이드레이션이 끝나기 전에는 서버가 HTML을 그린 시각으로 고정한다.
// 서버 HTML은 CDN이 최대 약 10분 들고 있다(api/ssr.js). 그 사이 "n시 오픈"을 넘기면 브라우저가 지금 시각으로
// 다시 계산한 값이 서버 HTML과 어긋나 하이드레이션 오류(#418/#423)가 났다. 어긋남 없이 이어받은 뒤에 실시간으로 푼다.
import { useSyncExternalStore } from 'react'

const hasWindow = typeof window !== 'undefined'
let live = !hasWindow || !(window.__SSR__?.renderedAt > 0) // 서버나 SSR 데이터가 없으면 처음부터 실시간
const listeners = new Set()
let timer = null

export const pageNow = () => new Date(live ? Date.now() : window.__SSR__.renderedAt)

/** 하이드레이션이 끝났다. 고정을 풀고 구독한 컴포넌트를 다시 그린다. */
export function goLive() {
  if (live) return
  live = true
  listeners.forEach((f) => f())
}

const minute = () => Math.floor(pageNow().getTime() / 60_000)
const subscribe = (cb) => {
  listeners.add(cb)
  timer ??= setInterval(() => listeners.forEach((f) => f()), 60_000) // 열어 둔 채 오픈 시각을 넘기면 바뀐다
  return () => {
    listeners.delete(cb)
    if (!listeners.size) { clearInterval(timer); timer = null }
  }
}
/** 분 단위로 바뀌는 값. 읽기만 해도 컴포넌트가 분마다, 그리고 고정이 풀릴 때 다시 그려진다. */
export const usePageMinute = () => useSyncExternalStore(subscribe, minute, minute)
