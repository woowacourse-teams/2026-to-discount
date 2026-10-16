import { test } from 'node:test'
import assert from 'node:assert/strict'
import middleware from '../middleware.js'

// 2026-10-17 메인 화면 A/B 결론: 모두 쿠폰 카드. 예전 old 쿠키도 쿠폰 카드로 덮고, ?home=old만 운영 카드로 남긴다.
const req = (url, cookie = '') => new Request(url, { headers: { cookie } })

test('쿠키가 없거나 old여도 쿠폰 카드로 그리고 쿠키를 coupon으로 맞춘다', () => {
  for (const cookie of ['', 'dk_home=old']) {
    const r = middleware(req('https://x.test/', cookie))
    assert.match(r.headers.get('x-middleware-rewrite'), /__arm=coupon/)
    assert.match(r.headers.get('set-cookie'), /dk_home=coupon/)
  }
})

test('이미 coupon이면 쿠키를 다시 심지 않고, ?home=old는 운영 카드 그대로', () => {
  assert.equal(middleware(req('https://x.test/', 'dk_home=coupon')).headers.get('set-cookie'), null)
  assert.equal(middleware(req('https://x.test/?home=old')), undefined)
})
