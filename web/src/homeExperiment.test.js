import test from 'node:test'
import assert from 'node:assert/strict'
import { currentHomeArm, homeArm } from './homeExperiment.js'

const START = Date.parse('2026-12-01T00:00:00+09:00')
const after = START + 1000

test('시작 시각이 비어 있거나 아직 안 됐으면 운영 주소는 모두 A', () => {
  assert.equal(homeArm('v_abc', after, null), 'coupon')
  assert.equal(homeArm('v_abc', START - 1, START), 'coupon')
  assert.equal(homeArm('', after, START), 'coupon')
})

test('같은 방문자는 늘 같은 안이고 반반에 가깝게 나뉜다', () => {
  assert.equal(homeArm('v_same', after, START), homeArm('v_same', after, START))
  let v2 = 0
  for (let i = 0; i < 4000; i++) if (homeArm(`v_${(i * 2654435761).toString(16)}${i}`, after, START) === 'v2') v2++
  assert.ok(v2 > 1800 && v2 < 2200, `v2 ${v2}/4000`)
})

test('주소로 강제하면 배정과 상관없이 그 안이고 forced로 표시', () => {
  const base = { visitorId: 'v_x', prodHost: true, now: after, start: START }
  assert.deepEqual(currentHomeArm({ ...base, search: '?home=a' }), { arm: 'coupon', forced: true })
  assert.deepEqual(currentHomeArm({ ...base, search: '?home=v2' }), { arm: 'v2', forced: true })
  assert.deepEqual(currentHomeArm({ ...base, search: '?home=b' }), { arm: 'v2', forced: true })
})

test('운영 주소가 아니면(프리뷰, localhost) 기본이 시안이고, 운영 주소는 시험을 켜기 전까지 A', () => {
  assert.deepEqual(currentHomeArm({ visitorId: 'v_x', prodHost: false, search: '', now: after, start: START }), { arm: 'v2', forced: false, save: 'v2' })
  assert.deepEqual(currentHomeArm({ visitorId: 'v_x', prodHost: true, search: '', now: after, start: null }), { arm: 'coupon', forced: false })
})

test('B로 배정된 방문자는 첫 방문에 A, 갈래를 저장한 다음 방문부터 B', () => {
  let id = 0
  const pick = (want) => { for (;;) { const v = `v_${id++}`; if (homeArm(v, after, START) === want) return v } }
  const base = { prodHost: true, search: '', now: after, start: START }
  const b = pick('v2')
  assert.deepEqual(currentHomeArm({ ...base, visitorId: b, saved: null }), { arm: 'coupon', forced: false, save: 'v2' })
  assert.deepEqual(currentHomeArm({ ...base, visitorId: b, saved: 'v2' }), { arm: 'v2', forced: false, save: 'v2' })
  assert.deepEqual(currentHomeArm({ ...base, visitorId: pick('coupon'), saved: null }), { arm: 'coupon', forced: false, save: 'coupon' })
})
