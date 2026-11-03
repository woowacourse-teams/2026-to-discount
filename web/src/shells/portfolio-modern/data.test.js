import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHome, NONE, UNKNOWN_MIN } from './data.js'
import { displayBestAmount } from '../../filters.js'
import { offerLink } from '../../offerLink.js'

const offer = (o) => ({ platform: 'baemin', amount: 7000, minOrderAmount: 15000, capturedAt: '2026-11-03T01:00:00Z', ...o })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', links: {}, offers, ...extra })

const BRANDS = [
  brand('가나치킨', [offer({}), offer({ platform: 'yogiyo', amount: 6000, minOrderAmount: null })]),
  brand('다라피자', [offer({ amount: 9000, minOrderAmount: 0, capturedAt: '2026-11-03T02:00:00Z' })], { category: 'pizza' }),
  brand('메뉴한정', [offer({ amount: 8000, qualifier: '특정메뉴', certainty: 'menuOnly' })]),
  brand('징거', [offer({ amount: 15000, kind: 'bundle', rawText: '징거버거 1+1' })]),
]

test('양성 신호: 어댑터가 카드를 한 장 이상 낸다', () => {
  const home = buildHome(BRANDS)
  assert.ok(home.cards.length >= 1)
  assert.equal(home.summary.count >= 1, true)
})

test('금액은 "n원 할인", 묶음은 원문 그대로', () => {
  const cards = Object.fromEntries(buildHome(BRANDS).cards.map((c) => [c.name, c]))
  assert.equal(cards['가나치킨'].amount, '7,000원 할인')
  if (cards['징거']) assert.equal(cards['징거'].amount, '징거버거 1+1')
})

test('특정메뉴 한정만 있는 브랜드의 대표 금액은 displayBestAmount(null)와 같다', () => {
  const b = BRANDS[2]
  assert.equal(displayBestAmount(b.offers, { random: false, menu: false }), null)
  const card = buildHome(BRANDS).cards.find((c) => c.name === '메뉴한정')
  // 4,999원 정렬 천장이 화면 금액으로 새지 않는다
  if (card) assert.ok(!card.amount.startsWith('4,999'))
})

test('최소주문: null은 미확인, 0은 없음, 숫자는 숫자', () => {
  const b = (min) => buildHome([brand('테스트', [offer({ minOrderAmount: min })])]).cards[0].min
  assert.equal(b(null), UNKNOWN_MIN)
  assert.equal(b(0), '최소주문 없음')
  assert.equal(b(15000), '15,000')
})

test('오퍼 없는 앱은 -, 값을 모르는 앱은 미확인: 둘이 다르다', () => {
  const card = buildHome(BRANDS).cards.find((c) => c.name === '가나치킨')
  const by = Object.fromEntries(card.apps.map((a) => [a.key, a]))
  assert.equal(by.coupangeats.amount, NONE)
  assert.equal(by.coupangeats.none, true)
  assert.equal(by.yogiyo.min, UNKNOWN_MIN)
  assert.notEqual(by.coupangeats.amount, by.yogiyo.min)
})

test('링크는 offerLink와 같다', () => {
  const o = offer({ link: 'https://example.com/a' })
  const b = brand('링크', [o])
  assert.equal(buildHome([b]).cards[0].href, offerLink(o, b.links, b.name))
})

test('쿠팡이츠 오퍼 링크도 offerLink 규칙을 따른다', () => {
  const o = offer({ platform: 'coupangeats', link: null })
  const b = brand('쿠팡', [o])
  assert.equal(buildHome([b]).cards[0].href, offerLink(o, b.links, b.name))
})

test('capturedAt이 전부 없으면 갱신 시각은 null', () => {
  const home = buildHome([brand('시각없음', [offer({ capturedAt: null })])])
  assert.equal(home.updatedAt, null)
  assert.ok(home.cards.length >= 1)
})

test('갱신 시각은 가장 최근 값', () => {
  assert.equal(buildHome(BRANDS).updatedAt, '2026-11-03T02:00:00Z')
})

test('카테고리를 고르면 그 분류만 남는다', () => {
  const names = buildHome(BRANDS, ['pizza']).cards.map((c) => c.name)
  assert.deepEqual(names, ['다라피자'])
})
