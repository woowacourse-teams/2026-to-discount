// 할인 기록 그래프의 점 고르기(누르기, 끌기, 좌우 화살표). BestHistoryChart와 my-brands-v2 PriceChart가 같이 쓴다(#456).
import { useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { nearestIndex } from './historyChart.js'
import { addTouch } from './useOverlay.js'

// 좌우 화살표로 한 칸. 고른 점이 없으면 왼쪽은 끝에서, 오른쪽은 처음에서 시작한다.
export function stepSelection(sel, dir, count) {
  return Math.min(count - 1, Math.max(0, (sel ?? (dir < 0 ? count : -1)) + dir))
}

// 처음 4px을 넘게 움직인 쪽으로 손짓 방향을 정한다. 정해진 뒤에는 바꾸지 않는다.
export function gestureAxis(dir, dx, dy) {
  if (dir || dx + dy <= 4) return dir
  return dx > dy ? 'x' : 'y'
}

export function useChartScrub(svgRef, data, brand, range) {
  const [sel, setSel] = useState(null)
  const timer = useRef(null)
  const drag = useRef(null) // 누른 채 끄는 중이면 { pointer, seen: 지나간 점 번호 }
  useEffect(() => () => clearTimeout(timer.current), [])
  // 손가락 끌기: 처음 움직임이 위아래면 그대로 시트 스크롤·끌어 닫기에 맡긴다.
  // 좌우로 먼저 끌기 시작한 뒤에만 그 손짓이 끝날 때까지 시트로 올라가지 않게 막는다.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let g = null
    return addTouch(el, {
      start: (e) => { const t = e.touches[0]; g = { x: t.clientX, y: t.clientY, dir: null } },
      move: (e) => {
        if (!g) return
        const t = e.touches[0]
        g.dir = gestureAxis(g.dir, Math.abs(t.clientX - g.x), Math.abs(t.clientY - g.y))
        if (g.dir === 'x') { e.stopPropagation(); if (e.cancelable) e.preventDefault() }
      },
      end: () => { g = null },
    })
  }, [svgRef, data])

  // 그릴 점(pts), 점의 x 좌표(xs), viewBox 폭(width)이 정해진 뒤 부른다.
  const bind = (pts, xs, width) => {
    const pick = (e) => {
      e.stopPropagation()
      clearTimeout(timer.current)
      const r = svgRef.current.getBoundingClientRect()
      const i = nearestIndex(((e.clientX - r.left) / r.width) * width, xs)
      if (drag.current) drag.current.seen.add(i)
      setSel(i)
    }
    // 터치는 손을 떼도 잠깐 남겨 읽을 시간을 준다. 마우스는 올려둔 동안만.
    const onUp = (e) => {
      e.stopPropagation()
      // 누른 채 끌어 두 날짜 이상 지나갔으면 손을 뗄 때 한 번만 남긴다(2026-10-12 사용자). 움직일 때마다 보내면 폭증한다.
      const d = drag.current
      drag.current = null
      if (d && d.seen.size > 1) {
        track('history_drag', { brand, range, pointer: d.pointer, points: d.seen.size, last: pts[[...d.seen].pop()]?.date ?? null })
      }
      if (e.pointerType === 'mouse') return
      timer.current = setTimeout(() => setSel(null), 1500)
    }
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const d = e.key === 'ArrowLeft' ? -1 : 1
      setSel((s) => stepSelection(s, d, pts.length))
    }
    const svgProps = {
      onPointerDown: (e) => { track('history_point_select', { brand, range, pointer: e.pointerType || 'none' }); drag.current = { pointer: e.pointerType || 'none', seen: new Set() }; pick(e) },
      onPointerMove: pick,
      onPointerUp: onUp,
      onPointerCancel: onUp,
      onPointerLeave: (e) => { if (e.pointerType === 'mouse') setSel(null) },
    }
    return { svgProps, onKey }
  }
  return { sel, setSel, bind }
}
