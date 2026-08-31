import assert from 'node:assert/strict'
import test from 'node:test'
import { brandImpressionProps, createBrandImpressionTracker } from './brandImpression.js'

function harness({ stored = null, storageFails = false } = {}) {
  let observerCallback
  const observed = new Set()
  const timers = new Map()
  const captured = []
  const listeners = new Map()
  const values = new Map(stored == null ? [] : [['dk_brand_impressions', stored]])
  let nextTimer = 1

  const visibilityTarget = {
    visibilityState: 'visible',
    addEventListener(name, listener) { listeners.set(name, listener) },
    removeEventListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name)
    },
  }
  const storage = {
    getItem(key) {
      if (storageFails) throw new Error('blocked')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (storageFails) throw new Error('blocked')
      values.set(key, value)
    },
  }
  const tracker = createBrandImpressionTracker({
    capture: (props) => captured.push(props),
    createObserver(callback, options) {
      observerCallback = callback
      assert.deepEqual(options, { threshold: [0.99] })
      return {
        observe: (element) => observed.add(element),
        unobserve: (element) => observed.delete(element),
        disconnect: () => observed.clear(),
      }
    },
    visibilityTarget,
    storage,
    setTimer(callback, delay) {
      assert.equal(delay, 1000)
      const id = nextTimer++
      timers.set(id, callback)
      return id
    },
    clearTimer: (id) => timers.delete(id),
  })

  return {
    tracker,
    captured,
    observed,
    stored: () => values.get('dk_brand_impressions'),
    intersect(element, ratio) {
      observerCallback([{ target: element, isIntersecting: ratio > 0, intersectionRatio: ratio }])
    },
    runTimers() {
      const pending = [...timers.values()]
      timers.clear()
      pending.forEach((callback) => callback())
    },
    setVisibility(state) {
      visibilityTarget.visibilityState = state
      listeners.get('visibilitychange')?.()
    },
  }
}

const props = { brand: '교촌치킨', position: '1', platforms: 'baemin+yogiyo', category: 'chicken' }

test('브랜드 노출 props를 화면 상태에서 정규화한다', () => {
  assert.deepEqual(brandImpressionProps({
    name: '교촌치킨',
    category: 'chicken',
    offers: [{ platform: 'yogiyo' }, { platform: 'baemin' }, { platform: 'baemin' }],
  }, 4), {
    brand: '교촌치킨',
    position: '4',
    platforms: 'baemin+yogiyo',
    category: 'chicken',
  })
  assert.equal(brandImpressionProps({ name: '미분류', category: null, offers: [] }, 1).category, 'none')
})

test('헤더가 99% 이상 1초 유지된 브랜드를 한 번 기록한다', () => {
  const h = harness()
  const element = {}
  h.tracker.register(element, props)
  h.intersect(element, 0.99)
  h.runTimers()
  h.intersect(element, 0)
  h.intersect(element, 1)
  h.runTimers()

  assert.deepEqual(h.captured, [props])
  assert.equal(h.stored(), '["교촌치킨"]')
})

test('헤더가 99% 미만이거나 1초 전에 벗어나면 기록하지 않는다', () => {
  const h = harness()
  const element = {}
  h.tracker.register(element, props)
  h.intersect(element, 0.989)
  h.runTimers()
  h.intersect(element, 1)
  h.intersect(element, 0.5)
  h.runTimers()

  assert.deepEqual(h.captured, [])
})

test('백그라운드에서는 타이머를 취소하고 돌아오면 처음부터 잰다', () => {
  const h = harness()
  const element = {}
  h.tracker.register(element, props)
  h.intersect(element, 1)
  h.setVisibility('hidden')
  h.runTimers()
  assert.deepEqual(h.captured, [])

  h.setVisibility('visible')
  h.runTimers()
  assert.deepEqual(h.captured, [props])
})

test('등록 해제 뒤에는 진행 중인 노출을 기록하지 않는다', () => {
  const h = harness()
  const element = {}
  const unregister = h.tracker.register(element, props)
  h.intersect(element, 1)
  unregister()
  h.runTimers()

  assert.deepEqual(h.captured, [])
  assert.equal(h.observed.has(element), false)
})

test('같은 세션에 저장된 브랜드는 새 tracker에서도 기록하지 않는다', () => {
  const h = harness({ stored: '["교촌치킨"]' })
  const element = {}
  h.tracker.register(element, props)

  assert.equal(h.observed.has(element), false)
  assert.deepEqual(h.captured, [])
})

test('세션 저장소가 막혀도 페이지 메모리로 중복을 막는다', () => {
  const h = harness({ storageFails: true })
  const first = {}
  const second = {}
  h.tracker.register(first, props)
  h.intersect(first, 1)
  h.runTimers()
  h.tracker.register(second, props)

  assert.deepEqual(h.captured, [props])
  assert.equal(h.observed.has(second), false)
})
