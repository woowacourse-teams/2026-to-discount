import test from 'node:test'
import assert from 'node:assert/strict'
import { gestureAxis, stepSelection } from './useChartScrub.js'

// 특성 테스트(#456): 두 그래프에 복사돼 있던 화살표 이동과 손짓 방향 판정을 못박는다.
test('화살표: 고른 점이 없으면 왼쪽은 끝, 오른쪽은 처음, 양 끝에서 멈춘다', () => {
  assert.equal(stepSelection(null, -1, 5), 4)
  assert.equal(stepSelection(null, 1, 5), 0)
  assert.equal(stepSelection(0, -1, 5), 0)
  assert.equal(stepSelection(4, 1, 5), 4)
  assert.equal(stepSelection(2, 1, 5), 3)
})
test('손짓 방향: 4px을 넘으면 더 크게 움직인 축으로 정하고 바꾸지 않는다', () => {
  assert.equal(gestureAxis(null, 2, 2), null)
  assert.equal(gestureAxis(null, 5, 1), 'x')
  assert.equal(gestureAxis(null, 1, 5), 'y')
  assert.equal(gestureAxis(null, 3, 3), 'y')
  assert.equal(gestureAxis('y', 50, 0), 'y')
})
