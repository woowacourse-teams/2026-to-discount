import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters, displayBestAmount, sortBrands } from '../../filters.js'
import { minLabel } from '../../couponModel.js'
import { offerLink } from '../../offerLink.js'
import { BOLD_CARD_LIMIT, buildBoldHome, loadBoldHome } from './data.js'

const offer = (over = {}) => ({
  platform: 'baemin', amount: 6000, minOrderAmount: 15000, qualifier: null, soldOut: false,
  capturedAt: '2026-10-30T05:20:00Z', ...over,
})
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', offers, links: {}, ...extra })

const BRANDS = [
  brand('가', [offer({ amount: 9000 })]),
  brand('나', [offer({ amount: 8000, platform: 'coupangeats', minOrderAmount: null })]),
  brand('다', [offer({ amount: 7000, minOrderAmount: 0 })]),
  brand('라', [offer({ amount: 6500 })]),
  brand('마', [offer({ amount: 6400 })]),
  brand('바', [offer({ amount: 6300 })]),
  brand('사', [offer({ amount: 6200 })]),
  brand('품절만', [offer({ amount: 20000, soldOut: true })]),
  brand('메뉴만', [offer({ amount: 30000, qualifier: '특정메뉴' })]),
]

test('양성 신호: 오퍼가 있는 입력은 카드가 나온다', () => {
  const home = buildBoldHome(BRANDS, [])
  assert.ok(home.cards.length > 0)
  assert.ok(home.capturedAt)
})

test('상위 6장이 홈과 같은 이름 순서다', () => {
  const f = defaultFilters()
  const expected = sortBrands(applyFilters(BRANDS, f), { sorts: f.sorts, include: false })
    .map((b) => b.name)
    .filter((n) => !['품절만'].includes(n)) // 품절뿐인 브랜드는 카드에서 빠진다
  const names = buildBoldHome(BRANDS, []).cards.map((c) => c.brandName)
  assert.equal(names.length, BOLD_CARD_LIMIT)
  assert.deepEqual(names, expected.slice(0, BOLD_CARD_LIMIT))
})

test('금액은 displayBestAmount와 같고 특정메뉴뿐인 브랜드에 4,999원이 찍히지 않는다', () => {
  const home = buildBoldHome(BRANDS, [])
  for (const c of home.cards) assert.equal(c.amount, displayBestAmount(c.brand.offers, false))
  assert.ok(!home.cards.some((c) => c.amount === 4999))
})

test('href는 offerLink 결과이고 쿠팡이츠는 허브 링크, 모두 문자열이다', () => {
  const home = buildBoldHome(BRANDS, [])
  for (const c of home.cards) {
    assert.equal(typeof c.href, 'string')
    assert.equal(c.href, offerLink(c.offer, c.brand.links, c.brand.name))
  }
  const ce = home.cards.find((c) => c.appChip === 'coupangeats')
  assert.ok(ce)
  assert.ok(ce.href.length > 0)
})

test('최소주문 모름은 null, 0원은 최소주문 없음', () => {
  const home = buildBoldHome(BRANDS, [])
  assert.equal(home.cards.find((c) => c.brandName === '나').minLabel, null)
  assert.equal(home.cards.find((c) => c.brandName === '다').minLabel, minLabel(0))
  assert.equal(minLabel(0), '최소주문 없음')
})

test('품절 오퍼만 가진 브랜드는 카드에서 빠진다', () => {
  const home = buildBoldHome([brand('품절만', [offer({ soldOut: true })]), BRANDS[0]], [])
  assert.deepEqual(home.cards.map((c) => c.brandName), ['가'])
})

test('오퍼가 없는 입력은 빈 카드, 던지지 않고 capturedAt은 null', () => {
  const home = buildBoldHome([], [])
  assert.deepEqual(home.cards, [])
  assert.equal(home.capturedAt, null)
})

test('loadBoldHome은 주입한 fetcher로 읽고 실패는 던진다', async () => {
  const home = await loadBoldHome({ fetchers: { fetchBrands: async () => BRANDS, fetchBanners: async () => [] } })
  assert.ok(home.cards.length > 0)
  await assert.rejects(loadBoldHome({ fetchers: { fetchBrands: async () => { throw new Error('API 500') }, fetchBanners: async () => [] } }))
})
