import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiFile } from '../scripts/api-repo.mjs'
import { createShareLink, parseShareLink, sharedOfferKey, resolveSharedOffer, shareText, deliverShare, shareMethod } from './offerSharing.js'

const id = 'a'.repeat(32)
const offer = { platform: 'baemin', amount: 7000, minOrderAmount: 18000, conditions: '배달만',
  membership: 'baeminClub', expiresAt: '2026-11-30', tiers: [{ amount: 7000, minOrder: 18000 }, { amount: 5000, minOrder: 15000 }] }
const brand = { name: '테스트 & 치킨', offers: [offer] }
const hash = () => new URL(createShareLink('https://example.com/brand/old?dev=1', brand.name, offer, id)).hash

test('공유 링크는 브랜드와 개별 혜택을 보존하고 이전 경로와 쿼리는 전달하지 않는다', () => {
  const url = new URL(createShareLink('https://example.com/brand/old?dev=1', brand.name, offer, id))
  assert.equal(url.pathname, '/')
  // 유입 경로 from=share만 싣는다(#221). 이전 쿼리(dev)는 안 따라간다.
  assert.equal(url.search, '?from=share')
  assert.equal(url.searchParams.get('dev'), null)
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
  assert.match(text, /^배달의민족 BBQ 최대 7,000원 할인 \(배민클럽 전용\)\n18,000원 이상 주문 시/)
  assert.match(text, /배민클럽/)
  assert.ok(!text.includes('배달만'))
  assert.ok(!text.includes('5,000원 할인'))
  assert.ok(!text.includes('undefined'))
  assert.match(shareText('KFC', { platform: 'own', kind: 'bundle', rawText: '버거 1+1', amount: 15000 }), /버거 1\+1/)
  assert.ok(!shareText('KFC', { platform: 'own', kind: 'bundle', rawText: '버거 1+1', amount: 15000 }).includes('15,000'))
})

test('기본 공유에는 문구와 URL을 전달하고 링크 복사는 URL만 복사', async () => {
  const data = { title: '혜택', text: shareText('BBQ', offer), url: 'https://example.com/#share=a' }
  let native, copied
  assert.equal(await deliverShare({ share: async (value) => { native = value } }, data, 'native'), 'resolved')
  assert.deepEqual(native, { text: `${data.text}\n${data.url}` })
  assert.equal(native.title, undefined)
  assert.equal(native.url, undefined)
  assert.equal(native.text.split('\n').at(-1), data.url)
  assert.equal(await deliverShare({ clipboard: { writeText: async (value) => { copied = value } } }, data, 'copy'), 'copied')
  assert.equal(copied, data.url)
})

test('공유 지원 여부도 링크가 마지막 줄에 포함된 실제 전달 데이터로 검사', () => {
  const data = { title: '혜택', text: 'bhc 5,000원 할인\n19,900원 이상 주문 시', url: 'https://example.com/#share=a' }
  let checked
  assert.equal(shareMethod({ share() {}, canShare(value) { checked = value; return true } }, data), 'native')
  assert.deepEqual(checked, { text: `${data.text}\n${data.url}` })
})

test('정률 상한은 유지하고 선착순과 날짜는 제외', () => {
  const text = shareText('BBQ', { ...offer, firstCome: true,
    tiers: [{ percent: 10, cap: 7000, minOrder: 18000, channel: '포장', expiresAt: '2026-11-10' }] })
  assert.ok(!text.includes('선착순'))
  assert.match(text, /포장 10% 할인 \(최대 7,000원\)/)
  assert.doesNotMatch(text, /11월 10일|2026-11-10/)
  assert.match(text, /18,000원 이상 주문 시/)
})

test('공유한 대표 혜택만 표시하고 다른 채널의 혜택은 넣지 않는다', () => {
  const text = shareText('bhc', { platform: 'ddangyo', amount: 5000, minOrderAmount: 19900,
    expiresAt: '2026-12-31', tiers: [
      { amount: 5000, minOrder: 19900, channel: '배달' },
      { amount: 6000, minOrder: 19900, channel: '포장' },
    ] }, { year: 2026 })
  assert.equal(text, '땡겨요 bhc 배달 5,000원 할인\n19,900원 이상 주문 시')
})

test('대표 혜택의 멤버십은 한 번만 표시하고 날짜와 다른 구간 조건은 제외', () => {
  const text = shareText('BBQ', { ...offer, badge: '배민클럽', tiers: [
    { amount: 7000, minOrder: 18000, membership: 'baeminClub' },
    { amount: 5000, minOrder: 15000, membership: 'baeminClub' },
  ] }, { year: 2026 })
  assert.equal(text.split('배민클럽').length - 1, 1)
  assert.match(text, /7,000원 할인 \(배민클럽 전용\)\n18,000원 이상 주문 시/)
  assert.ok(!text.includes('15,000원'))
  assert.doesNotMatch(shareText('BBQ', { ...offer, tiers: [], expiresAt: '2027-01-01' }), /2027|1월 1일/)
  const date = shareText('BBQ', { ...offer, tiers: [], badge: '~11/30' }, { year: 2026 })
  assert.ok(!date.includes('11월 30일까지'))
  assert.ok(!date.includes('~11/30'))
})

test('높은 금액이 앞에 있어도 현재 대표 금액에 해당하는 구간만 공유', () => {
  const text = shareText('bhc', { platform: 'ddangyo', amount: 5000, minOrderAmount: 19900,
    tiers: [{ amount: 6000, minOrder: 19900, channel: '포장' },
      { amount: 5000, minOrder: 19900, channel: '배달' }] })
  assert.equal(text, '땡겨요 bhc 배달 5,000원 할인\n19,900원 이상 주문 시')
})

test('다른 구간의 멤버십을 대표 혜택에 상속하지 않는 최신 카드 규칙 재사용', () => {
  const text = shareText('BBQ', { platform: 'baemin', amount: 7000, minOrderAmount: 18000,
    membership: 'baeminClub', tiers: [{ amount: 7000, minOrder: 18000 },
      { amount: 5000, minOrder: 15000, membership: 'baeminClub' }] })
  assert.ok(!text.includes('배민클럽'))
  assert.ok(!text.includes('5,000원 할인'))
})

test('중복 할인은 개별 구간을 대표 할인으로 바꾸지 않는다', () => {
  const text = shareText('BBQ', { ...offer, qualifier: '최적', tierMode: 'cumulative',
    conditions: '5,000원 + 2,000원', tiers: [
      { amount: 5000, minOrder: 18000 }, { amount: 2000, minOrder: 18000 },
    ] }, { year: 2026 })
  assert.match(text, /^배달의민족 BBQ 7,000원 할인 \(배민클럽 전용\)\n18,000원 이상 주문 시/)
  assert.ok(!text.includes('5,000원 + 2,000원'))
})

test('공유 취소와 실패 및 복사 실패를 구분하고 취소 후 복사하지 않는다', async () => {
  const nav = { share: async () => { throw { name: 'AbortError' } }, clipboard: { writeText() { assert.fail('취소 후 복사') } } }
  assert.equal(await deliverShare(nav, {}, 'native'), 'cancelled')
  assert.equal(await deliverShare({ share: async () => { throw Error('fail') } }, {}, 'native'), 'failed')
  assert.equal(await deliverShare({}, {}, 'copy'), 'failed')
  assert.equal(shareMethod({}, {}), 'copy')
  assert.equal(shareMethod({ share() {}, canShare() { throw Error() } }, {}), 'copy')
})

test('실제 도미노 샘플: 일반 4,000원 공유에 다른 멤버십 구간의 7,500원 배지를 넣지 않는다', () => {
  const fixtures = JSON.parse(readFileSync(apiFile('src', 'main', 'resources', 'data', 'export.json'), 'utf8'))
  const sample = fixtures.find((o) => o.brand === '도미노피자' && o.platform === 'baemin')
  assert.equal(sample.badge, '멤버십 7,500원')
  assert.equal(shareText(sample.brand, sample, { year: 2026 }),
    '배달의민족 도미노피자 4,000원 할인\n18,900원 이상 주문 시')
})

test('다른 구간을 안내하는 금액 배지는 제거하고 현재 혜택의 실제 멤버십은 유지', () => {
  for (const badge of ['멤버십 5,000원', '멤버십 5천원', '멤버십 0.5만원']) {
    const text = shareText('BBQ', { ...offer, badge }, { year: 2026 })
    assert.match(text, /7,000원 할인/)
    assert.match(text, /배민클럽/)
    assert.ok(!text.includes(badge))
  }
  const text = shareText('BBQ', { ...offer, membership: 'none', badge: '배민클럽 전용쿠폰',
    tiers: [{ amount: 7000, minOrder: 18000 },
      { amount: 5000, minOrder: 15000, membership: 'baeminClub' }] }, { year: 2026 })
  assert.ok(!text.includes('배민클럽'))
})

test('추가 안내가 있어도 멤버십을 첫 줄에 포함해 본문 두 줄 유지', () => {
  const text = shareText('BBQ', { ...offer, badge: '오전 11시 오픈',
    tiers: [{ amount: 7000, minOrder: 18000, note: '선착순', expiresAt: '2026-11-10' },
      { amount: 5000, minOrder: 15000 }] }, { year: 2026 })
  assert.match(text, /배민클럽/)
  assert.ok(!text.includes('오전 11시 오픈'))
  assert.ok(!text.includes('선착순'))
  assert.doesNotMatch(text, /11월 10일|2026-11-10/)
  assert.equal(text.split('\n').length, 2)
})
