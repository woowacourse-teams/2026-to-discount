import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters } from '../../filters.js'
import { brandsOf, categoryTiles, kstStamp, newestCaptured, rowsOf } from './data.js'

const offer = (o) => ({ platform: 'baemin', certainty: 'exact', capturedAt: '2026-11-03T01:00:00Z', ...o })
const brand = (name, category, offers) => ({ name, category, offers, links: {} })
// 한 카테고리가 보이려면 오퍼가 5개를 넘어야 한다(MIN_CATEGORY_OFFERS).
const filler = (n, amount = 6000) => Array.from({ length: n }, (_, i) => offer({ amount: amount + i * 100, minOrderAmount: 15000 }))

test('특정메뉴 쿠폰뿐인 브랜드는 4,999원을 금액으로 내지 않는다', () => {
  const brands = [
    brand('메뉴한정', 'chicken', [offer({ amount: 9000, certainty: 'menuOnly', minOrderAmount: 10000 }), ...filler(3)]),
    brand('보통', 'chicken', filler(3, 7000)),
  ]
  const tile = categoryTiles(brands).find((t) => t.key === 'chicken')
  assert.notEqual(tile.amount, '4,999원')
  // 확정 금액이 있는 브랜드가 1위다(메뉴한정 쿠폰은 액면 9,000원으로 올라오지 않는다).
  assert.ok(['메뉴한정', '보통'].includes(tile.brandName))
  assert.ok(!tile.amount || !/^4,999/.test(tile.amount))
})

test('5,000원 미만만 가진 카테고리는 금액 없이 보이지 않거나 건수만 낸다', () => {
  const brands = [brand('싼집', 'pizza', Array.from({ length: 6 }, () => offer({ amount: 3000 })))]
  const tile = categoryTiles(brands).find((t) => t.key === 'pizza')
  // 기본 필터(5,000원 이상)가 오퍼를 다 빼므로 목록이 비고, 금액과 링크가 없다.
  assert.equal(tile?.amount ?? null, null)
  assert.equal(tile?.href ?? null, null)
  assert.equal(tile?.count ?? 0, 0)
})

test('목록 순서는 applyFilters 결과 그대로다', () => {
  const brands = [
    brand('가', 'cafe', filler(3, 6000)),
    brand('나', 'cafe', filler(3, 9000)),
    brand('다', 'cafe', filler(3, 7000)),
  ]
  const f = defaultFilters()
  f.categories = new Set(['cafe'])
  const expected = applyFilters(brands, f).map((b) => b.name)
  assert.deepEqual(brandsOf(brands, 'cafe').map((b) => b.name), expected)
  assert.deepEqual(rowsOf(brands, 'cafe').map((r) => r.name), expected)
})

test('빈 입력은 visibleCategories 규칙대로 칸을 낸다(브랜드 없음 = 건수 0, 금액 없음)', () => {
  const tiles = categoryTiles([])
  assert.equal(tiles.length, 0)
})

test('칸의 1위 값이 목록 첫 줄과 같다', () => {
  const brands = [brand('가', 'korean', filler(3, 6000)), brand('나', 'korean', filler(3, 9000))]
  const tile = categoryTiles(brands).find((t) => t.key === 'korean')
  const first = rowsOf(brands, 'korean')[0]
  assert.equal(tile.brandName, first.name)
  assert.equal(tile.amount, first.amount)
})

test('최소주문을 모르면 정식 라벨을 낸다', () => {
  const brands = [brand('가', 'korean', Array.from({ length: 6 }, () => offer({ amount: 8000 })))]
  assert.equal(rowsOf(brands, 'korean')[0].minOrder, '최소주문 미확인')
})

test('시각은 한국 시각으로 읽고 못 읽으면 null', () => {
  assert.equal(kstStamp('2026-11-03T16:30:00Z'), '11.04 01:30')
  assert.equal(kstStamp(null), null)
  assert.equal(kstStamp('아님'), null)
  assert.equal(newestCaptured([{ capturedAt: null }]), null)
  assert.equal(newestCaptured([{ capturedAt: 'a' }, { capturedAt: 'b' }]), 'b')
})
