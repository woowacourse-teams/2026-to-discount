import test from 'node:test'
import assert from 'node:assert/strict'
import { createShareLink, parseShareLink, sharedOfferKey, resolveSharedOffer, shareText, deliverShare, shareMethod } from './offerSharing.js'

const id = 'a'.repeat(32)
const offer = { platform: 'baemin', amount: 7000, minOrderAmount: 18000, conditions: '배달만',
  membership: 'baeminClub', expiresAt: '2026-11-30', tiers: [{ amount: 7000, minOrder: 18000 }, { amount: 5000, minOrder: 15000 }] }
const brand = { name: '테스트 & 치킨', offers: [offer] }
const hash = () => new URL(createShareLink('https://example.com/brand/old?dev=1', brand.name, offer, id)).hash

test('공유 링크는 브랜드와 개별 혜택을 보존하고 이전 경로와 쿼리는 전달하지 않는다', () => {
  const url = new URL(createShareLink('https://example.com/brand/old?dev=1', brand.name, offer, id))
  assert.equal(url.pathname, '/')
  assert.equal(url.search, '')
  assert.deepEqual(parseShareLink(url.hash), { shareId: id, brand: brand.name, offerKey: sharedOfferKey(offer) })
})

test('수집 시각, 정렬 순서, 신규 및 품절 상태는 같은 혜택의 키를 바꾸지 않는다', () => {
  assert.equal(sharedOfferKey({ ...offer, tiers: [...offer.tiers].reverse(), capturedAt: 'tomorrow', soldOut: true, isNew: true }), sharedOfferKey(offer))
})

test('플랫폼이 같아도 금액과 최소주문, 조건, 기간, 멤버십, 구간 또는 유형이 달라지면 다른 혜택', () => {
  for (const change of [{ amount: 8000 }, { minOrderAmount: 19000 }, { conditions: '포장만' },
    { expiresAt: '2026-12-01' }, { membership: 'none' }, { firstCome: true },
    { tiers: [{ amount: 9000, minOrder: 25000 }] }]) {
    assert.notEqual(sharedOfferKey({ ...offer, ...change }), sharedOfferKey(offer))
  }
})

test('잘못된 값과 중복 매개변수는 정상 공유 유입으로 파싱하지 않는다', () => {
  for (const value of ['', '#brand-test', '#share=bad', `${hash()}&share=${id}`, hash().replace(id, 'x'.repeat(32)), hash().replace('brand=', 'b=')]) {
    assert.equal(parseShareLink(value), null)
  }
})

test('목록 위치와 무관하게 정확한 혜택을 찾고, 변경 또는 만료된 혜택을 대체하지 않는다', () => {
  const target = parseShareLink(hash())
  const other = { ...offer, amount: 9000, firstCome: true }
  const result = resolveSharedOffer([{ ...brand, offers: [other, offer] }], target, '2026-10-28')
  assert.equal(result.offer, offer)
  assert.equal(result.status, 'available')
  assert.equal(resolveSharedOffer([{ ...brand, offers: [other] }], target, '2026-10-28').status, 'not_found')
  assert.equal(resolveSharedOffer([brand], target, '2026-11-30').status, 'available')
  assert.equal(resolveSharedOffer([brand], target, '2026-12-01').status, 'expired')
  assert.equal(resolveSharedOffer([], target, '2026-10-28').status, 'not_found')
})

test('공유 문구에 할인 성격과 주문 및 멤버십과 구간 조건을 보존', () => {
  const text = shareText('BBQ', { ...offer, qualifier: '최대' })
  assert.match(text, /^BBQ 배달의민족 최대 7,000원 할인\n18,000원 이상 주문 시/)
  assert.match(text, /배민클럽/)
  assert.match(text, /배달만/)
  assert.match(text, /5,000원 \/ 15,000원 이상/)
  assert.ok(!text.includes('undefined'))
  assert.match(shareText('KFC', { platform: 'own', kind: 'bundle', rawText: '버거 1+1', amount: 15000 }), /버거 1\+1/)
  assert.ok(!shareText('KFC', { platform: 'own', kind: 'bundle', rawText: '버거 1+1', amount: 15000 }).includes('15,000'))
})

test('기본 공유에는 문구와 URL을 전달하고 링크 복사는 URL만 복사', async () => {
  const data = { title: '혜택', text: shareText('BBQ', offer), url: 'https://example.com/#share=a' }
  let native, copied
  assert.equal(await deliverShare({ share: async (value) => { native = value } }, data, 'native'), 'resolved')
  assert.deepEqual(native, data)
  assert.equal(await deliverShare({ clipboard: { writeText: async (value) => { copied = value } } }, data, 'copy'), 'copied')
  assert.equal(copied, data.url)
})

test('선착순과 정률 상한 및 구간별 만료 조건을 메시지에 유지', () => {
  const text = shareText('BBQ', { ...offer, firstCome: true,
    tiers: [{ percent: 10, cap: 7000, minOrder: 18000, channel: '포장', expiresAt: '2026-11-10' }] })
  assert.match(text, /선착순/)
  assert.match(text, /10% 할인 \/ 최대 7,000원 \/ 18,000원 이상 \/ 포장 \/ ~2026-11-10/)
})

test('공유 취소와 실패 및 복사 실패를 구분하고 취소 후 복사하지 않는다', async () => {
  const nav = { share: async () => { throw { name: 'AbortError' } }, clipboard: { writeText() { assert.fail('취소 후 복사') } } }
  assert.equal(await deliverShare(nav, {}, 'native'), 'cancelled')
  assert.equal(await deliverShare({ share: async () => { throw Error('fail') } }, {}, 'native'), 'failed')
  assert.equal(await deliverShare({}, {}, 'copy'), 'failed')
  assert.equal(shareMethod({}, {}), 'copy')
  assert.equal(shareMethod({ share() {}, canShare() { throw Error() } }, {}), 'copy')
})
