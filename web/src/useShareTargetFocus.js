import { useEffect, useRef } from 'react'

export function useShareTargetFocus(root, key, ready, onVisible) {
  const focused = useRef(null)
  useEffect(() => {
    if (!key) { focused.current = null; return undefined }
    if (!ready || (focused.current?.key === key && focused.current.onVisible === onVisible)) return undefined
    const frame = requestAnimationFrame(() => {
      const element = root.current?.querySelector(`[data-offer-key="${key}"]`)
      if (!element) return
      element.scrollIntoView({ block: 'center' })
      element.focus({ preventScroll: true })
      focused.current = { key, onVisible }
      onVisible?.()
    })
    return () => cancelAnimationFrame(frame)
  }, [root, key, ready, onVisible])
}
