import assert from 'node:assert/strict'
import test from 'node:test'
import { guideSteps, shouldShowGuide } from './firstVisitGuide.js'

const first = { visitCount: 1, pathname: '/', search: '' }

test('주소에 ?guide=1이 있을 때만 뜬다(첫 방문 자동 노출 없음, 2026-10-14)', () => {
  assert.equal(shouldShowGuide(first), false)
  assert.equal(shouldShowGuide({ visitCount: 9, pathname: '/x', search: '?guide=1' }), true)
  assert.equal(shouldShowGuide({ ...first, search: '?guide=0' }), false)
})

test('두 안은 바 쪽 단계만 다르다', () => {
  const keys = (arm) => guideSteps(arm).map((s) => s.key)
  assert.deepEqual(keys('old'), ['card', 'sort', 'category', 'platform', 'search'])
  assert.deepEqual(keys('coupon'), ['card', 'sort', 'category', 'search', 'filter'])
})
