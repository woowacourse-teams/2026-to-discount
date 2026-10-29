import test from 'node:test'
import assert from 'node:assert/strict'
import { createShareAttribution, initializeShareAttribution } from './shareAttribution.js'
import { createShareLink, sharedOfferKey } from './offerSharing.js'
const storage = () => {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const offer = { platform: 'baemin', amount: 7000 }
const id = 'a'.repeat(32)
const hash = new URL(createShareLink('https://example.com', 'BBQ', offer, id)).hash
const make = (options = {}) => createShareAttribution({ local: storage(), session: storage(),
  random: () => 'landing', now: () => '2026-10-28T00:00:00Z', ...options })

test('공유 유입과 세 종류의 할인 선택을 연결', () => {
  const tracker = make({ visitorStatus: 'new' })
  tracker.enter(hash)
  assert.equal(tracker.props().shareId, id)
  assert.equal(tracker.props().sharedOfferKey, sharedOfferKey(offer))
  assert.equal(tracker.props().visitorStatus, 'new')
  assert.equal(tracker.selection(offer, 'BBQ').selectionRelation, 'shared_offer')
  assert.equal(tracker.selection({ ...offer, amount: 9000 }, 'BBQ').selectionRelation, 'same_brand_other_offer')
  assert.equal(tracker.selection(offer, '교촌').selectionRelation, 'other_brand')
})

test('StrictMode와 재렌더 중복 방지, 새로고침은 새 화면 진입', () => {
  const local = storage(), session = storage(), tracker = make({ local, session })
  tracker.enter(hash)
  assert.equal(tracker.claim('landing'), true)
  tracker.enter(hash)
  assert.equal(tracker.claim('landing'), false)
  assert.equal(tracker.claim('target', 'available'), true)
  assert.equal(tracker.claim('target', 'available'), false)
  const reload = make({ local, session, random: () => 'reload' })
  reload.enter(hash)
  assert.equal(reload.props().landingId, 'reload')
  assert.equal(reload.claim('landing'), true)
})

test('자기 링크는 구분하고 실제 공유 수신 이력으로 남기지 않는다', () => {
  const local = storage(), tracker = make({ local })
  tracker.rememberOwn(id)
  tracker.enter(hash)
  assert.equal(tracker.props().selfOpen, true)
  const later = make({ local })
  later.enter('')
  assert.deepEqual(later.props(), {})
})

test('같은 세션의 탐색과 이후 직접 재방문은 구분하고 관측 기간을 강제하지 않는다', () => {
  const local = storage(), session = storage(), tracker = make({ local, session })
  tracker.enter(hash)
  tracker.enter('')
  assert.equal(tracker.props().attributionType, 'share_session')
  assert.equal(tracker.claim('landing'), false)
  const next = make({ local })
  next.enter('')
  assert.equal(next.props().attributionType, 'prior_share')
  assert.equal(next.props().entrySource, 'direct')
  assert.equal(next.props().shareId, id)
  assert.equal(next.props().landingId, undefined)
  assert.equal(next.props().shareReceivedAt, '2026-10-28T00:00:00Z')
  assert.equal(next.claim('landing'), false)
})

test('새로운 공유 링크는 독립된 유입으로 기록', () => {
  const tracker = make()
  tracker.enter(hash)
  const next = 'b'.repeat(32)
  tracker.enter(new URL(createShareLink('https://example.com', '교촌', offer, next)).hash)
  assert.equal(tracker.props().shareId, next)
  assert.equal(tracker.selection(offer, '교촌').selectionRelation, 'shared_offer')
})

test('스토리지 차단, 잘못된 링크와 페이지 탐색에서도 공유와 메모리 계측 유지', () => {
  const broken = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  const tracker = make({ local: broken, session: broken })
  tracker.enter('#share=invalid')
  assert.deepEqual(tracker.props(), {})
  tracker.rememberOwn(id)
  tracker.enter(hash)
  assert.equal(tracker.props().selfOpen, true)
  tracker.enter('')
  assert.equal(tracker.props().shareId, id)
  assert.equal(tracker.props().visitorStatus, 'unknown')
})

test('수집 거부 시 공유 맥락을 읽거나 기록하지 않는다', () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { doNotTrack: '1' } })
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      location: { hash }, get localStorage() { assert.fail('수집 거부 중 저장소 접근') },
    } })
    assert.equal(initializeShareAttribution(), null)
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow)
    else delete globalThis.window
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator)
    else delete globalThis.navigator
  }
})
