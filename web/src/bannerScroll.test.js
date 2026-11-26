import test from 'node:test'
import assert from 'node:assert/strict'
import { indexToSlot, settleSlot, slotToIndex, withSentinels } from './bannerScroll.js'

test('트랙은 마지막 장 사본으로 시작해 첫 장 사본으로 끝난다', () => {
  const b = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(withSentinels(b).map((x) => x.id), ['c', 'a', 'b', 'c', 'a'])
  assert.deepEqual(withSentinels([{ id: 'only' }]).map((x) => x.id), ['only'])
})

test('칸과 장 번호가 서로 돌아간다', () => {
  assert.equal(slotToIndex(1, 3), 0)
  assert.equal(slotToIndex(3, 3), 2)
  assert.equal(slotToIndex(0, 3), 2)   // 앞 사본 = 마지막 장
  assert.equal(slotToIndex(4, 3), 0)   // 뒤 사본 = 첫 장
  assert.equal(indexToSlot(0, 3), 1)
  assert.equal(indexToSlot(2, 3), 3)
  assert.equal(indexToSlot(0, 1), 0)
})

test('사본에 멈추면 실제 칸으로 옮긴다, 실제 칸이면 그대로', () => {
  assert.equal(settleSlot(0, 3), 3)
  assert.equal(settleSlot(4, 3), 1)
  assert.equal(settleSlot(2, 3), null)
  assert.equal(settleSlot(0, 1), null)
})

test('마지막 칸의 다음 칸은 첫 장 사본이다', () => {
  const count = 3
  const lastSlot = indexToSlot(2, count)
  assert.equal(slotToIndex(lastSlot + 1, count), 0)
})

// 특성 테스트(#456): EventBanner에서 뺀 끌어 넘기기와 트랙 위치 규칙을 못박는다.
test('끌어 넘기기: 끌기로 인정되고 40px을 넘겨야 한 칸, 왼쪽으로 밀면 다음 장', async () => {
  const { swipeStep } = await import('./useBannerSlider.js')
  assert.equal(swipeStep(true, -41), 1)
  assert.equal(swipeStep(true, 41), -1)
  assert.equal(swipeStep(true, -40), 0)
  assert.equal(swipeStep(false, -100), 0)
})
test('트랙 위치: 칸마다 100%+12px, 끄는 중이거나 애니메이션을 끄면 transition 없음', async () => {
  const { sliderTrackStyle } = await import('./useBannerSlider.js')
  assert.deepEqual(sliderTrackStyle(2, 0, true, false), { transform: 'translateX(calc(-2 * (100% + 12px) + 0px))', transition: 'transform 800ms cubic-bezier(.22, .8, .3, 1)' })
  assert.equal(sliderTrackStyle(1, -30, true, false).transition, 'none')
  assert.equal(sliderTrackStyle(1, 0, false, false).transition, 'none')
  assert.equal(sliderTrackStyle(1, 0, true, true).transition, 'none')
})
