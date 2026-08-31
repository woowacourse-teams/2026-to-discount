const STORAGE_KEY = 'dk_brand_impressions'
const IMPRESSION_MS = 1000
const VISIBLE_RATIO = 0.99

function readSeen(storage) {
  if (!storage) return new Set()
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((brand) => typeof brand === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeSeen(storage, seen) {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    // 저장소가 막힌 브라우저에서는 현재 페이지의 메모리 Set만 유지한다.
  }
}

export function brandImpressionProps(brand, position) {
  return {
    brand: brand.name,
    position: String(position),
    platforms: [...new Set(brand.offers.map((offer) => offer.platform))].sort().join('+'),
    category: brand.category ?? 'none',
  }
}

export function createBrandImpressionTracker({
  capture,
  createObserver,
  visibilityTarget,
  storage = null,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  impressionMs = IMPRESSION_MS,
}) {
  const seen = readSeen(storage)
  const registrations = new Map()
  const fullyVisible = new Set()
  const timers = new Map()
  let observer = null

  function cancel(element) {
    const timer = timers.get(element)
    if (timer === undefined) return
    clearTimer(timer)
    timers.delete(element)
  }

  function finish(element) {
    timers.delete(element)
    const props = registrations.get(element)
    if (!props || !fullyVisible.has(element) || visibilityTarget.visibilityState !== 'visible') return
    if (seen.has(props.brand)) return

    seen.add(props.brand)
    writeSeen(storage, seen)
    try {
      capture(props)
    } catch {
      // 분석 실패가 카드 렌더링이나 사용자 동작을 막지 않게 한다.
    }
  }

  function start(element) {
    const props = registrations.get(element)
    if (!props || seen.has(props.brand) || timers.has(element)) return
    if (!fullyVisible.has(element) || visibilityTarget.visibilityState !== 'visible') return
    timers.set(element, setTimer(() => finish(element), impressionMs))
  }

  function onIntersection(entries) {
    for (const entry of entries) {
      if (!registrations.has(entry.target)) continue
      if (entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO) {
        fullyVisible.add(entry.target)
        start(entry.target)
      } else {
        fullyVisible.delete(entry.target)
        cancel(entry.target)
      }
    }
  }

  function ensureObserver() {
    if (!observer) observer = createObserver(onIntersection, { threshold: [VISIBLE_RATIO] })
    return observer
  }

  function onVisibilityChange() {
    if (visibilityTarget.visibilityState !== 'visible') {
      for (const element of timers.keys()) cancel(element)
      return
    }
    for (const element of fullyVisible) start(element)
  }

  visibilityTarget.addEventListener('visibilitychange', onVisibilityChange)

  return {
    register(element, props) {
      if (!element || !props?.brand || seen.has(props.brand)) return () => {}
      registrations.set(element, props)
      ensureObserver().observe(element)
      return () => {
        cancel(element)
        fullyVisible.delete(element)
        registrations.delete(element)
        observer?.unobserve(element)
      }
    },
    destroy() {
      for (const element of timers.keys()) cancel(element)
      fullyVisible.clear()
      registrations.clear()
      observer?.disconnect()
      visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}

let browserTracker

function getBrowserTracker(capture) {
  if (browserTracker) return browserTracker
  if (typeof window === 'undefined' || typeof document === 'undefined'
      || typeof window.IntersectionObserver !== 'function') return null

  let storage = null
  try {
    storage = window.sessionStorage
  } catch {
    // sessionStorage getter 자체가 실패하는 환경도 메모리 Set으로 동작한다.
  }

  browserTracker = createBrandImpressionTracker({
    capture,
    createObserver: (callback, options) => new window.IntersectionObserver(callback, options),
    visibilityTarget: document,
    storage,
  })
  return browserTracker
}

export function observeBrandImpression(element, props, capture) {
  if (typeof capture !== 'function') return () => {}
  try {
    return getBrowserTracker(capture)?.register(element, props) ?? (() => {})
  } catch {
    // 브라우저 API 초기화 실패도 화면 렌더링 실패로 번지지 않게 한다.
    return () => {}
  }
}
