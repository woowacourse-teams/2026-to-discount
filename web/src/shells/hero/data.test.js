import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyFilters, defaultFilters, displayBestAmount, latestCaptured } from '../../filters.js'
import { offerLink } from '../../offerLink.js'
import { toHeroModel, LIST_MAX } from './data.js'

const fixture = JSON.parse(readFileSync(new URL('../../../scripts/dev/fixtures/brands.json', import.meta.url), 'utf8'))

const offer = (o) => ({
  platform: 'baemin', amount: 6000, qualifier: null, status: 'confirmed', rawText: '6,000원',
  minOrderAmount: 18000, tiers: [], conditions: null, soldOut: false, link: null, membership: 'none',
  certainty: 'exact', kind: 'discount', ...o,
})
const brand = (name, offers) => ({ name, category: '치킨', links: {}, offers })

test('히어로는 applyFilters의 맨 앞 브랜드다', () => {
  const m = toHeroModel(fixture)
  assert.ok(m.hero, '픽스처에서 히어로가 나와야 한다')
  assert.equal(m.hero.brandName, applyFilters(fixture, defaultFilters())[0].name)
})

test('히어로 금액은 displayBestAmount와 같다', () => {
  const m = toHeroModel(fixture)
  assert.equal(m.hero.offer.amount, displayBestAmount(m.hero.brand.offers))
})

test('특정메뉴 쿠폰뿐인 브랜드가 있어도 히어로 금액이 4,999로 찍히지 않는다', () => {
  const menuOnly = brand('메뉴전용', [offer({ amount: 30000, qualifier: '특정메뉴', certainty: 'menuOnly', rawText: '30,000원' })])
  const normal = brand('보통', [offer({ amount: 7000, rawText: '7,000원' })])
  const m = toHeroModel([menuOnly, normal])
  assert.notEqual(m.hero?.offer.amount, 4999)
  assert.notEqual(m.hero?.offer.amount, 30000)
  assert.equal(m.hero?.brandName, '보통')
})

test('hasBest가 아닌 브랜드는 히어로가 되지 않고 목록에는 있다', () => {
  const unsure = brand('불확정', [offer({ amount: 9000, qualifier: '최대', certainty: 'capped', rawText: '최대 9,000원' })])
  const sure = brand('확정', [offer({ amount: 6000 })])
  const m = toHeroModel([unsure, sure])
  assert.equal(m.hero.brandName, '확정')
  assert.deepEqual(m.list.map((c) => c.brandName), ['불확정'])
})

test('최소주문을 모르면 minLabel이 null이다', () => {
  const m = toHeroModel([brand('모름', [offer({ minOrderAmount: null })])])
  assert.equal(m.hero.minLabel, null)
})

test('brands가 비었거나 null이면 빈 모델이고 던지지 않는다', () => {
  const empty = { hero: null, list: [], checkedAt: null }
  assert.deepEqual(toHeroModel([]), empty)
  assert.deepEqual(toHeroModel(null), empty)
  assert.deepEqual(toHeroModel(undefined), empty)
})

test('목록은 최대 7장이고 히어로를 되풀이하지 않는다', () => {
  const m = toHeroModel(fixture)
  assert.ok(m.list.length <= LIST_MAX)
  assert.ok(m.list.every((c) => c.brandName !== m.hero.brandName))
  const many = Array.from({ length: 12 }, (_, i) => brand(`브랜드${i}`, [offer({ amount: 6000 + i * 100 })]))
  const big = toHeroModel(many)
  assert.equal(big.list.length, LIST_MAX)
  assert.ok(big.list.every((c) => c.brandName !== big.hero.brandName))
})

test('checkedAt은 latestCaptured와 같고 없으면 null이다', () => {
  const all = fixture.flatMap((b) => b.offers)
  assert.equal(toHeroModel(fixture).checkedAt, latestCaptured(all))
  assert.equal(toHeroModel([brand('시각없음', [offer({})])]).checkedAt, null)
})

test('쿠팡이츠 오퍼의 href는 offerLink의 반환과 같다', () => {
  const ce = brand('쿠팡', [offer({ platform: 'coupangeats', amount: 8000 })])
  const m = toHeroModel([ce])
  assert.equal(m.hero.href, offerLink(m.hero.offer, ce.links, ce.name))
  assert.ok(m.hero.href)
})
