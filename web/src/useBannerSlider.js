// 배너 캐러셀: 자리(slot) 하나로 상단과 도크를 같이 옮기고, 끝의 사본 칸에서 실제 칸으로 소리 없이 되감는다.
// EventBanner.jsx에서 뺐다(#456).
import { useEffect, useMemo, useRef, useState } from 'react'
import { settleSlot, slotToIndex, withSentinels } from './bannerScroll.js'

// 한 칸 미끄러지는 시간. 브라우저 smooth 스크롤(~300ms)보다 0.5초 느리게.
const SLIDE_MS = 800
// 장 사이 간격(App.css .banner-track gap과 같은 값).
const SLIDE_GAP = 12

// 놓을 때 넘길 방향. 끌기로 인정된 뒤 40px 넘게 밀었을 때만 한 칸(왼쪽으로 밀면 다음 장).
export function swipeStep(moved, dx) {
  if (!moved || Math.abs(dx) <= 40) return 0
  return dx < 0 ? 1 : -1
}

export function sliderTrackStyle(slot, dragX, anim, reduceMotion) {
  return {
    transform: `translateX(calc(${-slot} * (100% + ${SLIDE_GAP}px) + ${dragX}px))`,
    transition: anim && dragX === 0 && !reduceMotion ? `transform ${SLIDE_MS}ms cubic-bezier(.22, .8, .3, 1)` : 'none',
  }
}

export function useBannerSlider(banners, count, reduceMotion) {
  const [index, setIndex] = useState(0)
  // ── 슬라이더 ────────────────────────────────────────────────────────
  // 컴포넌트를 스크롤로 넘기지 않는다. 장 전체(앞뒤 사본 포함)를 한 줄로
  // 그려 놓고 **자리(slot) 하나만 상태로** 들고, 그 값을 transform으로
  // 옮긴다(사용자 결정 2026-09-16). 스크롤 컨테이너 방식은 scrollend·스냅
  // 재정렬·상단/도크 동기화가 브라우저마다 달라 이음새가 났다. 이 방식은
  // 상단과 도크가 같은 slot을 같은 transition으로 보므로 둘이 어긋날 길이
  // 없고, 사본 칸에 도착한 뒤 transition을 끈 채 실제 칸으로 옮기는 것도
  // 우리가 정한 시점에 정확히 한다.
  //
  //   slot: 0 = 마지막 장 사본, 1..count = 실제 장, count+1 = 첫 장 사본
  //   anim: transition을 켤지 — 사본→실제 칸 되감기는 끄고 옮긴다
  const slides = useMemo(() => withSentinels(banners ?? []), [banners])
  const [slot, setSlot] = useState(count > 1 ? 1 : 0)
  const [anim, setAnim] = useState(true)
  const busy = useRef(false)
  useEffect(() => { setSlot(count > 1 ? 1 : 0) }, [count])
  useEffect(() => { setIndex(slotToIndex(slot, count)) }, [slot, count])

  // 옆 칸으로. 사본에 도착하면 transition이 끝난 뒤 실제 칸으로 소리 없이.
  // 넘김 타이머는 언마운트와 장 수 변경 때 버린다. 남으면 사라진 컴포넌트나 범위 밖 장에 setSlot한다.
  const stepTimer = useRef()
  useEffect(() => () => { clearTimeout(stepTimer.current); busy.current = false }, [count])
  function step(dir) {
    if (count < 2 || busy.current) return
    const next = slot + dir
    if (next < 0 || next > count + 1) return
    busy.current = true
    setAnim(!reduceMotion)
    setSlot(next)
    const real = settleSlot(next, count)
    const dur = reduceMotion ? 0 : SLIDE_MS
    stepTimer.current = setTimeout(() => {
      if (real !== null) {
        setAnim(false)
        setSlot(real)
        // 한 프레임 뒤 transition을 다시 켠다 — 같이 켜면 되감기도 미끄러진다.
        requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)))
      }
      busy.current = false
    }, dur + 20)
  }
  function advance() { step(1) }

  // 손가락·마우스로 끌기. 끄는 동안은 transition 없이 따라오고, 놓으면
  // 40px 넘게 밀었을 때만 한 칸 넘긴다. 세로 스크롤이 더 크면 넘기지 않는다.
  const drag = useRef(null)
  const [dragX, setDragX] = useState(0)
  function onPointerDown(e) {
    if (count < 2 || e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) < 6) return
    if (!d.moved && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return }
    d.moved = true
    setDragX(dx)
  }
  function onPointerUp(e) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragX(0)
    const dir = swipeStep(d.moved, e.clientX - d.x)
    if (dir) step(dir)
  }
  // 끌던 중 링크 클릭이 나가지 않게 — 놓는 순간 click이 한 번 더 온다.
  function onClickCapture(e) { if (Math.abs(dragX) > 6) { e.preventDefault(); e.stopPropagation() } }
  const dragProps = {
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture,
  }
  const trackStyle = sliderTrackStyle(slot, dragX, anim, reduceMotion)
  return { slides, index, step, advance, dragX, dragProps, trackStyle }
}
