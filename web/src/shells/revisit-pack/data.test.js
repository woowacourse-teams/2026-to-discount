import test from 'node:test'
import assert from 'node:assert/strict'
import { agoText, appCells, cardOf, minText, myBrands, newOffers, readSaved } from './data.js'

const offer = (o) => ({ platform: 'baemin', amount: 5000, minOrderAmount: 12000, ...o })
const brand = (name, offers, extra = {}) => ({ name, offers, links: {}, ...extra })

test('Given 오퍼 없는 앱 / When 앱별 칸을 만들 때 / Then 그 칸은 비어(-) 있고 앱 네 칸이 고정이다', () => {
  const cells = appCells(brand('A', [offer({})]))
  assert.equal(cells.length, 4)
  assert.ok(cells.find((c) => c.platform === 'baemin').cell)
  assert.equal(cells.find((c) => c.platform === 'yogiyo').cell, null)
})

test('Given minOrderAmount가 null / Then 최소주문 미확인', () => {
  assert.equal(minText(offer({ minOrderAmount: null })), '최소주문 미확인')
})

test('Given minOrderAmount가 0 / Then 최소주문 없음', () => {
  assert.equal(minText(offer({ minOrderAmount: 0 })), '최소주문 없음')
})

test('Given 최소주문 12000 / Then 12,000원↑', () => {
  assert.equal(minText(offer({})), '12,000원↑')
})

test('Given 특정메뉴 쿠폰뿐인 브랜드 / When 대표 금액을 만들 때 / Then 4,999가 나오지 않는다', () => {
  const b = brand('B', [offer({ qualifier: '특정메뉴', amount: 3000 })])
  const card = cardOf(b)
  assert.ok(!card.headAmount.includes('4,999'))
})

test('Given 저장한 이름이 응답에 없음 / Then 건너뛴다', () => {
  const brands = [brand('A', [offer({})]), brand('B', [offer({})])]
  const r = myBrands(brands, ['없는곳', 'B'])
  assert.equal(r.filled, false)
  assert.deepEqual(r.brands.map((b) => b.name), ['B'])
})

test('Given 저장소가 비고 인기 데이터가 없음 / Then 채움 모드이고 비어 온다', () => {
  const r = myBrands([brand('A', [offer({})])], [])
  assert.equal(r.filled, true)
  assert.deepEqual(r.brands, [])
})

test('Given 저장소가 비고 인기 상위가 있음 / Then popularToday 결과로 채운다', () => {
  const brands = ['A', 'B', 'C'].map((n, i) => brand(n, [offer({})], { popularityToday: 10 - i }))
  const r = myBrands(brands, [])
  assert.equal(r.filled, true)
  assert.deepEqual(r.brands.map((b) => b.name), ['A', 'B', 'C'])
})

test('Given isNew가 true인 오퍼가 하나도 없음 / Then 새 오퍼 구역은 비어 있다', () => {
  assert.deepEqual(newOffers([brand('A', [offer({ isNew: false })])]), [])
})

test('Given isNew인 오퍼 / Then 그 브랜드가 새 오퍼로 나온다', () => {
  const r = newOffers([brand('A', [offer({ isNew: true })]), brand('B', [offer({ isNew: false })])])
  assert.deepEqual(r.map((x) => x.brand.name), ['A'])
})

test('갱신 시각 서식: 값이 없으면 null, 분/시간/어제', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  assert.equal(agoText(null, now), null)
  assert.equal(agoText('2026-11-03T11:30:00Z', now), '30분 전')
  assert.equal(agoText('2026-11-03T09:00:00Z', now), '3시간 전')
  assert.equal(agoText('2026-11-02T09:00:00Z', now), '어제')
})

test('저장소가 막히거나 깨져도 빈 배열', () => {
  assert.deepEqual(readSaved({ getItem() { throw new Error('blocked') } }), [])
  assert.deepEqual(readSaved({ getItem: () => 'not json' }), [])
})
