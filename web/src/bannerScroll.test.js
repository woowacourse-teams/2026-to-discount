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
