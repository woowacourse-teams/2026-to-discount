import { test } from 'node:test'
import assert from 'node:assert/strict'
import middleware from '../middleware.js'

// 2026-10-17 메인 화면 A/B 결론: 모두 쿠폰 카드. 실험 쿠키(dk_home=old)가 남아 있어도 쿠폰 카드, ?home=old만 운영 카드.
const req = (url, cookie = '') => new Request(url, { headers: { cookie } })

test('쿠키가 없거나 예전 old여도 쿠폰 카드로 그리고 쿠키는 심지 않는다', () => {
  for (const cookie of ['', 'dk_home=old', 'dk_home=coupon']) {
    const r = middleware(req('https://x.test/', cookie))
    assert.match(r.headers.get('x-middleware-rewrite'), /__arm=coupon/)
    assert.equal(r.headers.get('set-cookie'), null)
  }
})

test('?home=old는 운영 카드 그대로, utm만 떼고 쿠폰 표시는 붙이지 않는다', () => {
  assert.equal(middleware(req('https://x.test/?home=old')), undefined)
  assert.doesNotMatch(middleware(req('https://x.test/?home=old&utm_source=x')).headers.get('x-middleware-rewrite'), /__arm/)
})