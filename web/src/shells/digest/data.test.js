import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters } from '../../filters.js'
import { conditionTable } from '../../couponModel.js'
import { digestOf, MIN_UNKNOWN, minText } from './data.js'

const offer = (platform, amount, extra = {}) => ({
  platform, amount, certainty: 'exact', kind: 'discount', minOrderAmount: 15000, isNew: false, capturedAt: '2026-11-03T01:00:00Z', ...extra,
})
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', links: {}, offers, ...extra })

test('오늘 할인 칸 숫자 == 카드 수 == applyFilters 길이', () => {
  const brands = [
    brand('가', [offer('baemin', 8000)]),
    brand('나', [offer('yogiyo', 6000)]),
    brand('작은', [offer('baemin', 1000)]), // 5천원 미만은 기본 필터가 뺀다
  ]
  const d = digestOf(brands, 'today')
  assert.equal(d.tiles.today.count, applyFilters(brands, defaultFilters()).length)
  assert.equal(d.tiles.today.count, d.cards.length)
  assert.equal(d.cards.length, 2)
})

test('새로 생김 칸 숫자 == updatedOnly 목록 길이 == 눌러서 나온 카드 수', () => {
  const brands = [
    brand('신규', [offer('baemin', 9000, { isNew: true })]),
    brand('옛', [offer('baemin', 7000)]),
  ]
  const d = digestOf(brands, 'fresh')
  assert.equal(d.tiles.fresh.count, 1)
  assert.equal(d.cards.length, 1)
  assert.equal(d.cards[0].name, '신규')
})

test('배민 오퍼만 있으면 나머지 앱 칸은 null(-), 배민 칸은 금액', () => {
  const d = digestOf([brand('가', [offer('baemin', 8000)])])
  const cells = d.cards[0].cells
  assert.deepEqual(cells.map((c) => c.platform), ['baemin', 'coupangeats', 'ddangyo', 'yogiyo'])
  assert.equal(cells[0].amountText, '8,000원')
  assert.ok(cells[0].href)
  for (const c of cells.slice(1)) {
    assert.equal(c.amountText, null)
    assert.equal(c.href, null)
  }
})

test('최고로 못 치는 오퍼(상한)도 "-"가 아니라 amountText를 그린다', () => {
  const d = digestOf([brand('가', [
    offer('baemin', 8000),
    offer('yogiyo', 6000, { certainty: 'capped' }),
  ])])
  const yogiyo = d.cards[0].cells[3]
  assert.equal(yogiyo.amountText, '6,000원')
  assert.ok(yogiyo.href)
})

test('최소주문을 모르면 "최소주문 미확인", 빈 문자열이 아니다', () => {
  const d = digestOf([brand('가', [offer('baemin', 8000, { minOrderAmount: null })])])
  assert.equal(d.cards[0].best.minText, '최소주문 미확인')
  assert.equal(minText(null), MIN_UNKNOWN)
})

test('최소주문 0은 "최소주문 없음", 양수는 금액', () => {
  assert.equal(minText(0), '최소주문 없음')
  assert.equal(minText(15000), '최소주문 15,000원')
})

test('특정메뉴 쿠폰만 있는 브랜드의 최고 금액은 4,999가 아니라 액면', () => {
  const d = digestOf([brand('가', [offer('baemin', 8000, { certainty: 'menuOnly' })])])
  assert.equal(d.cards.length, 1)
  assert.equal(d.cards[0].best.amountText, '8,000원') // displayBestAmount는 특정메뉴를 못 끼워 null이면 원문, 어느 쪽이든 4,999는 아니다
  assert.notEqual(d.tiles.top.amount, 4999)
})

test('최고 금액 칸은 displayBestAmount의 최댓값', () => {
  const d = digestOf([
    brand('가', [offer('baemin', 8000), offer('yogiyo', 12000)]),
    brand('나', [offer('baemin', 9000)]),
  ], 'top')
  assert.equal(d.tiles.top.amount, 12000)
  assert.equal(d.cards[0].name, '가')
  assert.equal(d.cards[0].highlight, true)
})

test('품절 오퍼보다 품절 아닌 오퍼를 주 버튼으로 고른다', () => {
  const d = digestOf([brand('가', [offer('baemin', 12000, { soldOut: true }), offer('yogiyo', 8000)])])
  assert.equal(d.cards[0].best.platform, 'yogiyo')
  assert.equal(d.cards[0].best.soldOut, false)
})

test('브랜드가 없으면 칸 숫자 0, 최고 금액 null, capturedAt null, 예외 없음', () => {
  for (const input of [[], null, undefined]) {
    const d = digestOf(input)
    assert.equal(d.tiles.today.count, 0)
    assert.equal(d.tiles.fresh.count, 0)
    assert.equal(d.tiles.top.amount, null)
    assert.equal(d.capturedAt, null)
    assert.deepEqual(d.cards, [])
  }
})

test('capturedAt은 전체 오퍼 중 가장 최근', () => {
  const d = digestOf([
    brand('가', [offer('baemin', 8000, { capturedAt: '2026-11-03T01:00:00Z' })]),
    brand('나', [offer('baemin', 1000, { capturedAt: '2026-11-03T05:00:00Z' })]),
  ])
  assert.equal(d.capturedAt, '2026-11-03T05:00:00Z')
})

test('"최소주문 미확인"은 couponModel conditionTable의 min 줄과 같은 글자', () => {
  const o = offer('baemin', 8000, { minOrderAmount: null, tiers: [{ amount: 8000, channel: '배달' }] })
  const rows = conditionTable(o).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].min, MIN_UNKNOWN)
})
