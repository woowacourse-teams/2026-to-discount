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
  assert.match(text, /^BBQ 배달의민족 최대 7,000원 할인 \(18,000원 이상 주문 시\)/)
  assert.match(text, /배민클럽/)
  assert.match(text, /배달만/)
  assert.match(text, /최대 5,000원 할인 \(15,000원 이상 주문 시\)/)
  assert.ok(!text.includes('undefined'))
  assert.match(shareText('KFC', { platform: 'own', kind: 'bundle', rawText: '버거 1+1', amount: 15000 }), /버거 1\+1/)
  assert.ok(!shareText('KFC', { platform: 'own', kind: 'bundle', rawText: '버거 1+1', amount: 15000 }).includes('15,000'))
})

test('기본 공유에는 문구와 URL을 전달하고 링크 복사는 URL만 복사', async () => {
  const data = { title: '혜택', text: shareText('BBQ', offer), url: 'https://example.com/#share=a' }
  let native, copied
  assert.equal(await deliverShare({ share: async (value) => { native = value } }, data, 'native'), 'resolved')
  assert.deepEqual(native, { title: data.title, text: `${data.text}\n${data.url}` })
  assert.equal(native.url, undefined)
  assert.equal(native.text.split('\n').at(-1), data.url)
  assert.equal(await deliverShare({ clipboard: { writeText: async (value) => { copied = value } } }, data, 'copy'), 'copied')
  assert.equal(copied, data.url)
})

test('공유 지원 여부도 링크가 마지막 줄에 포함된 실제 전달 데이터로 검사', () => {
  const data = { title: '혜택', text: 'bhc 5,000원 할인\n19,900원 이상 주문 시', url: 'https://example.com/#share=a' }
  let checked
  assert.equal(shareMethod({ share() {}, canShare(value) { checked = value; return true } }, data), 'native')
  assert.deepEqual(checked, { title: data.title, text: `${data.text}\n${data.url}` })
})

test('선착순과 정률 상한 및 구간별 만료 조건을 메시지에 유지', () => {
  const text = shareText('BBQ', { ...offer, firstCome: true,
    tiers: [{ percent: 10, cap: 7000, minOrder: 18000, channel: '포장', expiresAt: '2026-11-10' }] })
  assert.match(text, /선착순/)
  assert.match(text, /포장 10% 할인 \(최대 7,000원\) \((?:2026년 )?11월 10일까지\)/)
  assert.match(text, /18,000원 이상 주문 시/)
})

test('배달과 포장 혜택은 채널별로 나누고 공통 주문 조건과 기간은 한 번만 표시', () => {
  const text = shareText('bhc', { platform: 'ddangyo', amount: 5000, minOrderAmount: 19900,
    expiresAt: '2026-12-31', tiers: [
      { amount: 5000, minOrder: 19900, channel: '배달' },
      { amount: 6000, minOrder: 19900, channel: '포장' },
    ] }, { year: 2026 })
  assert.equal(text, 'bhc 땡겨요 배달 5,000원 할인\n포장 6,000원 할인\n19,900원 이상 주문 시\n12월 31일까지')
})

test('멤버십과 기간 중복 제거, 서로 다른 구간의 최소주문 및 멤버십 조건은 유지', () => {
  const text = shareText('BBQ', { ...offer, badge: '배민클럽', tiers: [
    { amount: 7000, minOrder: 18000, membership: 'baeminClub' },
    { amount: 5000, minOrder: 15000, membership: 'baeminClub' },
  ] }, { year: 2026 })
  assert.equal(text.split('배민클럽').length - 1, 1)
  assert.match(text, /7,000원 할인 \(18,000원 이상 주문 시\)/)
  assert.match(text, /5,000원 할인 \(15,000원 이상 주문 시\)/)
  assert.match(shareText('BBQ', { ...offer, tiers: [], expiresAt: '2027-01-01' }, { year: 2026 }), /2027년 1월 1일까지/)
  const date = shareText('BBQ', { ...offer, tiers: [], badge: '~11/30' }, { year: 2026 })
  assert.equal(date.split('11월 30일까지').length - 1, 1)
  assert.ok(!date.includes('~11/30'))
})

test('중복 할인은 개별 구간을 대표 할인으로 바꾸지 않는다', () => {
  const text = shareText('BBQ', { ...offer, qualifier: '최적', tierMode: 'cumulative',
    conditions: '5,000원 + 2,000원', tiers: [
      { amount: 5000, minOrder: 18000 }, { amount: 2000, minOrder: 18000 },
    ] }, { year: 2026 })
  assert.match(text, /^BBQ 배달의민족 7,000원 할인\n18,000원 이상 주문 시/)
  assert.match(text, /5,000원 \+ 2,000원/)
})

test('공유 취소와 실패 및 복사 실패를 구분하고 취소 후 복사하지 않는다', async () => {
  const nav = { share: async () => { throw { name: 'AbortError' } }, clipboard: { writeText() { assert.fail('취소 후 복사') } } }
  assert.equal(await deliverShare(nav, {}, 'native'), 'cancelled')
  assert.equal(await deliverShare({ share: async () => { throw Error('fail') } }, {}, 'native'), 'failed')
  assert.equal(await deliverShare({}, {}, 'copy'), 'failed')
  assert.equal(shareMethod({}, {}), 'copy')
  assert.equal(shareMethod({ share() {}, canShare() { throw Error() } }, {}), 'copy')
})
