import test from 'node:test'
import assert from 'node:assert/strict'
import { currentHomeArm } from './homeExperiment.js'

test('강제가 없으면 운영 주소든 아니든 모두 B', () => {
  assert.deepEqual(currentHomeArm({ search: '' }), { arm: 'v2', forced: false })
})

test('주소로 강제하면 그 안이고 forced로 표시', () => {
  assert.deepEqual(currentHomeArm({ search: '?home=a' }), { arm: 'coupon', forced: true })
  assert.deepEqual(currentHomeArm({ search: '?home=v2' }), { arm: 'v2', forced: true })
  assert.deepEqual(currentHomeArm({ search: '?home=b' }), { arm: 'v2', forced: true })
})
