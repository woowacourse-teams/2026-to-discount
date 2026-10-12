import assert from 'node:assert/strict'
import test from 'node:test'
import { guideSteps, markGuideSeen, shouldShowGuide } from './firstVisitGuide.js'

function storage() {
  const values = new Map()
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }
}
const first = { visitCount: 1, pathname: '/', search: '' }

test('첫 세션의 첫 화면에서만 한 번 뜬다', () => {
  const s = storage()
  assert.equal(shouldShowGuide(first, s), true)
  markGuideSeen(s)
  assert.equal(shouldShowGuide(first, s), false)
  assert.equal(shouldShowGuide({ ...first, visitCount: 2 }, storage()), false)
  assert.equal(shouldShowGuide({ ...first, pathname: '/brand/bhc' }, storage()), false)
})

test('?guide=1은 조건을 무시한다', () => {
  const s = storage(); markGuideSeen(s)
  assert.equal(shouldShowGuide({ visitCount: 9, pathname: '/x', search: '?guide=1' }, s), true)
})

test('저장소가 막히면 띄우지 않는다', () => {
  const broken = { getItem() { throw new Error('blocked') } }
  assert.equal(shouldShowGuide(first, broken), false)
})

test('두 안은 바 쪽 단계만 다르다', () => {
  const keys = (arm) => guideSteps(arm).map((s) => s.key)
  assert.deepEqual(keys('old'), ['card', 'sort', 'category', 'platform', 'search'])
  assert.deepEqual(keys('coupon'), ['card', 'sort', 'category', 'search', 'filter'])
})
