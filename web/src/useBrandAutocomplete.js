import { useCallback, useEffect, useMemo, useState } from 'react'

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
