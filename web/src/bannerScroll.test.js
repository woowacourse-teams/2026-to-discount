import test from 'node:test'
import assert from 'node:assert/strict'
import { jumpBehavior } from './bannerScroll.js'

test('옆 장은 미끄러진다', () => {
  assert.equal(jumpBehavior(0, 1), 'smooth')
  assert.equal(jumpBehavior(2, 1), 'smooth')
})

test('마지막에서 처음으로 돌 때는 갈아끼운다', () => {
  // 4장짜리에서 3 -> 0. smooth면 2, 1을 역순으로 훑고 지나간다.
  assert.equal(jumpBehavior(3, 0), 'instant')
})

test('점으로 건너뛸 때도 갈아끼운다', () => {
  assert.equal(jumpBehavior(0, 3), 'instant')
})

test('제자리는 애니메이션이 없다', () => {
  assert.equal(jumpBehavior(1, 1), 'instant')
})
