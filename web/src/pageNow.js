// 화면이 "지금"으로 치는 시각. 하이드레이션이 끝나기 전에는 서버가 HTML을 그린 시각으로 고정한다.
// 서버 HTML은 CDN이 최대 약 10분 들고 있다(api/ssr.js). 그 사이 "n시 오픈"을 넘기면 브라우저가 지금 시각으로
// 다시 계산한 값이 서버 HTML과 어긋나 하이드레이션 오류(#418/#423)가 났다. 어긋남 없이 이어받은 뒤에 실시간으로 푼다.
import { useSyncExternalStore } from 'react'

const hasWindow = typeof window !== 'undefined'
let live = !hasWindow || !(window.__SSR__?.renderedAt > 0) // 서버나 SSR 데이터가 없으면 처음부터 실시간
const listeners = new Set()
let timer = null

export const pageNow = () => new Date(live ? Date.now() : window.__SSR__.renderedAt)

/**
 * 선착순이 아직 안 열렸나. 배지 "오전 10시 오픈"의 시각이 지금보다 뒤면 참. 오픈 전은 품절과 같은 모양으로 그린다(2026-11-04 사용자).
 * ponytail: 시각만 본다(날짜 무시). 수집이 그날 아침 오퍼를 다시 쓰니 충분하다. 요일 행사가 남으면 날짜를 더한다.
 * couponModel.js에 있던 것을 옮겼다(filters.js가 같은 판정으로 요기요 오픈 전 오퍼를 거른다). couponModel.js가 다시 내보낸다.
 */
const OPENS_AT = /^(?:매일\s*)?(오전|오후)\s*(\d+)시(?:\s*(\d+)분)?\s*오픈/
export function beforeOpen(offer, now = pageNow()) {
  // 배지가 그냥 "선착순"이어도 conditions에 "오전 11시 오픈 선착순"이 있으면 같은 오퍼다(2026-11-15 배민 12개 중 9개가 놓쳤다).
  const m = (offer.badge ?? '').match(OPENS_AT) ?? (offer.conditions ?? '').match(OPENS_AT)
  if (!m) return false
  const h = (Number(m[2]) % 12) + (m[1] === '오후' ? 12 : 0) // 오후 12시 = 12, 오전 12시 = 0
  // 서울 시각으로 센다. 서버(UTC)와 브라우저가 같은 답을 내야 하이드레이션이 안 어긋난다(#418, 2026-11-04~05).
  const kst = new Date(now.getTime() + 9 * 3600_000)
  return kst.getUTCHours() * 60 + kst.getUTCMinutes() < h * 60 + Number(m[3] ?? 0)
}

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
