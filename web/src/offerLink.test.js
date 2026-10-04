import test from 'node:test'
import assert from 'node:assert/strict'
import { offerLink, offerClickProps } from './offerLink.js'

test('오퍼 자신의 링크가 먼저, 그다음 브랜드 링크', () => {
  assert.equal(offerLink({ platform: 'baemin', link: 'https://a' }, { baemin: 'https://b' }, 'BBQ'), 'https://a')
  assert.equal(offerLink({ platform: 'baemin' }, { baemin: 'https://b' }, 'BBQ'), 'https://b')
})

test('링크가 없어도 사다리 끝까지 내려가 빈 값이 없다', () => {
  for (const p of ['baemin', 'coupangeats', 'yogiyo', 'ddangyo']) {
    assert.ok(offerLink({ platform: p }, {}, 'BBQ'), `${p} 링크가 비었다`)
  }
})

test('클릭 속성은 운영 카드와 같은 키', () => {
  const p = offerClickProps({ offer: { platform: 'baemin', amount: 7000, minOrderAmount: 18000 }, brandName: 'BBQ', position: 3, best: true })
  assert.deepEqual(Object.keys(p).sort(), ['amount', 'best', 'brand', 'firstCome', 'fromBanner', 'held', 'isNew', 'membership', 'minOrder',
    'platform', 'position', 'qualifier', 'soldOut', 'tierMode', 'tiers'].sort())
  // 쿠폰 카드는 어디서 눌렀는지를 더 싣는다(2026-10-05)
  const q = offerClickProps({ offer: { platform: 'baemin', amount: 7000 }, brandName: 'BBQ', position: 3, best: true, where: 'carousel', slot: 2 })
  assert.equal(q.where, 'carousel'); assert.equal(q.slot, 2); assert.equal(q.isNew, false)
  assert.equal(p.brand, 'BBQ'); assert.equal(p.best, true); assert.equal(p.minOrder, 18000)
})
