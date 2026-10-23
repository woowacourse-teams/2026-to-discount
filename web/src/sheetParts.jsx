// 바텀시트 공용 조각: 한 줄 칩 트랙과 끌어내려 닫기. 필터 시트(FilterSheet.jsx)와 제보 시트(ReportButton.jsx)가 같이 쓴다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useScrollMore } from './MenuBar.jsx'

// 한 줄 캐러셀 트랙(2026-10-14 사용자: 여러 줄 칩이 눈 아프다, turbom /map 패턴).
// 넘치면 옆으로 밀고, 더 갈 쪽 끝만 흐린다. thumb면 고른 칸 아래 흰 판이 미끄러진다(하나 고르기용).
export function Track({ label, thumb = false, children }) {
  const [ref, more] = useScrollMore()
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    if (!thumb) return
    const on = ref.current?.querySelector('[aria-pressed="true"]')
    const next = on ? { left: on.offsetLeft, width: on.offsetWidth } : null
    // 값이 같으면 그대로 둔다. 매번 새 객체를 넣으면 다시 그리기가 끝없이 돈다.
    setPos((p) => (p?.left === next?.left && p?.width === next?.width ? p : next))
  })
  return (
    <div className={`sheet__track${more.left ? ' sheet__track--l' : ''}${more.right ? ' sheet__track--r' : ''}`}>
      <div ref={ref} className={`sheet__chips${thumb ? ' sheet__chips--thumb' : ''}`} role="group" aria-label={label}>
        {thumb && pos && <span className="sheet__thumb" aria-hidden="true" style={{ left: pos.left, width: pos.width }} />}
        {children}
      </div>
    </div>
  )
}

// 끌어내려 닫기. 본문이 맨 위일 때 아래로 끌면 시트가 따라 내려오고, 놓을 때 120px을 넘었거나 빠르게 튕겼으면 닫는다.
export function useDragClose(sheetRef, bodyRef, open, onClose) {
  // 닫기 함수는 렌더마다 바뀔 수 있어 ref로 든다. 바뀔 때마다 리스너를 다시 달면 대기 중인 닫기 타이머가 지워진다.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    const el = sheetRef.current
    if (!open || !el) return undefined
    let d = null
    let timer = null
    // 금액 막대를 끄는 손가락은 시트를 끌지 않는다(2026-10-14 사용자).
    const start = (e) => { d = e.target.closest?.('.sheet__range') ? null : { y0: e.touches[0].clientY, t: Date.now(), dy: 0, active: false } }
    const move = (e) => {
      if (!d) return
      const y = e.touches[0].clientY
      if (!d.active) {
        if (y - d.y0 <= 4) return
        if ((bodyRef.current?.scrollTop ?? 0) > 0) { d.y0 = y; return }
        d.active = true; d.y0 = y
      }
      d.dy = Math.max(0, y - d.y0)
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.dy}px)`
      e.preventDefault()
    }
    const end = () => {
      if (!d?.active) { d = null; return }
      const close = d.dy > 120 || (d.dy > 40 && Date.now() - d.t < 300)
      el.style.transition = 'transform .18s ease'
      el.style.transform = close ? 'translateY(100%)' : ''
      d = null
      if (close) timer = setTimeout(() => closeRef.current(), 160)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => { clearTimeout(timer); el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [sheetRef, bodyRef, open])
}
