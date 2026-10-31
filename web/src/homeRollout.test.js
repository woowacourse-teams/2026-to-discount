import { test } from 'node:test'
import assert from 'node:assert/strict'
import middleware from '../middleware.js'

// 메인 화면 A/B가 끝나 운영 카드 코드를 지웠다(2026-10-17). 미들웨어는 캐시 키만 다듬는다.
const req = (url) => new Request(url)

test('붙일 것도 뗄 것도 없으면 그대로 보낸다', () => {
  assert.equal(middleware(req('https://x.test/')), undefined)
})

test('dev, utm, 실험 때의 home과 __arm은 캐시 키에서 뗀다', () => {
  const r = middleware(req('https://x.test/?home=old&__arm=coupon&utm_source=x&dev=1&q=bbq'))
  assert.equal(r.headers.get('x-middleware-rewrite'), 'https://x.test/?q=bbq')
})

test('유입 경로 from은 캐시 키에서 뗀다(#221)', () => {
  assert.equal(middleware(req('https://x.test/?from=resume&q=bbq')).headers.get('x-middleware-rewrite'), 'https://x.test/?q=bbq')
  assert.equal(middleware(req('https://x.test/?from=share')).headers.get('x-middleware-rewrite'), 'https://x.test/')
})
