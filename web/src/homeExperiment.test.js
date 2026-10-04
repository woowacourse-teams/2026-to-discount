import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOME_AB_START, homeArm } from './homeExperiment.js'

test('시작 전에는 모두 운영 카드, 시작 뒤에는 방문자마다 고정된 반반', () => {
  assert.equal(homeArm('v_abc', HOME_AB_START - 1), 'old')
  assert.equal(homeArm('', HOME_AB_START + 1), 'old')
  const ids = Array.from({ length: 2000 }, (_, i) => `v_${i.toString(36)}x${(i * 7919).toString(36)}`)
  const coupon = ids.filter((id) => homeArm(id, HOME_AB_START) === 'coupon').length
  assert.ok(coupon > 900 && coupon < 1100, `반반이 아니다: ${coupon}/2000`)
  assert.equal(homeArm('v_same', HOME_AB_START), homeArm('v_same', HOME_AB_START + 86400000))
})
