import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { findBrandSuggestions } from './brandAutocomplete.js'

export function useBrandAutocomplete({ brands, input, onSelect }) {
  const suggestions = useMemo(() => findBrandSuggestions(brands, input), [brands, input])
  const [expanded, setExpanded] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    setActiveIndex(-1)
    if (String(input ?? '').trim() === '' || suggestions.length === 0) setExpanded(false)
  }, [input, suggestions.length])

  const open = () => {
    if (suggestions.length > 0) setExpanded(true)
  }
  const close = useCallback(() => {
    setExpanded(false)
    setActiveIndex(-1)
  }, [])
  const inputChanged = () => {
    setExpanded(true)
    setActiveIndex(-1)
  }
  const select = (index) => {
    const brand = suggestions[index]
    if (!brand) return false
    onSelect(brand)
    close()
    return true
  }
  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      close()
      return true
    }
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      setExpanded(true)
      setActiveIndex((current) => current < suggestions.length - 1 ? current + 1 : 0)
      return true
    }
    if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault()
      setExpanded(true)
      setActiveIndex((current) => current > 0 ? current - 1 : suggestions.length - 1)
      return true
    }
    if (event.key === 'Enter' && expanded && activeIndex >= 0 && !event.repeat) {
      event.preventDefault()
      return select(activeIndex)
    }
    return false
  }

  return {
    suggestions,
    activeIndex,
    isOpen: expanded && suggestions.length > 0,
    open,
    close,
    inputChanged,
    select,
    handleKeyDown,
  }
}

/**
 * 검색은 입력하는 대로 걸린다(2026-10-08 사용자). 기록(brand_search_submitted)은 글자마다 보내지 않고
 * 입력이 1.5초 멈췄을 때 한 번 'pause'로 보낸다. 엔터, 자동완성 선택으로 확정했으면 그 값은 다시 안 보낸다.
 */
export function useSearchPauseTrack(draft, onSubmit) {
  const sent = useRef('')
  useEffect(() => {
    const q = draft.trim()
    if (q === '' || q === sent.current) return undefined
    const t = setTimeout(() => { sent.current = q; onSubmit(draft, 'pause') }, 1500)
    return () => clearTimeout(t)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps
  return (q) => { sent.current = q.trim() }
}
