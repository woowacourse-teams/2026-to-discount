import test from 'node:test'
import assert from 'node:assert/strict'
import { offerLink, offerClickProps, COUPANGEATS_LINK, COUPANGEATS_NOTICE } from './offerLink.js'

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

test('쿠팡이츠: 탭 앱 링크든 무엇이든 공유 링크 하나로 연다(2026-10-12 사용자)', () => {
  assert.equal(offerLink({ platform: 'coupangeats', link: 'coupangeats://Web?url=x' }, {}, 'BBQ'), 'coupangeats://Web?url=x')
  assert.equal(offerLink({ platform: 'coupangeats' }, {}, 'BBQ'), COUPANGEATS_LINK)
})

test('쿠팡이츠: 사람 링크(원장 오퍼의 공유 링크)는 그대로, 배너 오퍼의 공유 링크는 허브로(#141)', () => {
  const link = 'https://share.coupangeats.com/x'
  assert.equal(offerLink({ platform: 'coupangeats', link }, {}, 'BBQ'), link)
  assert.equal(offerLink({ platform: 'coupangeats', link, fromBanner: true }, {}, 'BBQ'), COUPANGEATS_LINK)
})

test('쿠팡이츠: 공유 도메인이 아닌 https는 허브로(#141)', () => {
  assert.equal(offerLink({ platform: 'coupangeats', link: 'https://example.com/x' }, {}, 'BBQ'), COUPANGEATS_LINK)
  assert.equal(offerLink({ platform: 'coupangeats', link: 'https://share.coupangeats.com.example.com/x' }, {}, 'BBQ'), COUPANGEATS_LINK)
})

test('쿠팡이츠 허브 링크는 공유 링크 도메인으로 시작한다', () => {
  assert.ok(COUPANGEATS_LINK.startsWith('https://share.coupangeats.com/'), `허브 링크 형식이 틀렸다: ${COUPANGEATS_LINK}`)
})

test('쿠팡이츠 안내 문구는 비어 있지 않다', () => {
  assert.equal(typeof COUPANGEATS_NOTICE, 'string')
  assert.ok(COUPANGEATS_NOTICE.trim().length > 0, '쿠팡이츠 안내 문구가 비었다')
})

test('쿠팡이츠가 아닌 https 링크는 허브 링크로 바뀌지 않고 그대로 나간다', () => {
  for (const p of ['baemin', 'yogiyo', 'ddangyo']) {
    const link = `https://example.com/${p}`
    const got = offerLink({ platform: p, link }, {}, 'BBQ')
    assert.equal(got, link)
    assert.notEqual(got, COUPANGEATS_LINK)
  }
})
