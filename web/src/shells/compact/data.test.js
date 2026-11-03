import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultFilters } from '../../filters.js'
import { offerLink } from '../../offerLink.js'
import { buildRows, capturedLabel, checkedAt, conditionOf, minText, rowOf } from './data.js'

const offer = (platform, amount, extra = {}) => ({ platform, amount, minOrderAmount: 20000, ...extra })
const brand = (name, offers, extra = {}) => ({ name, offers, ...extra })
const F = defaultFilters()

test('동점 최고가 둘이면 줄은 하나, 앱 아이콘이 둘', () => {
  const row = rowOf(brand('A', [offer('baemin', 10000), offer('yogiyo', 10000), offer('ddangyo', 7000)]), F)
  assert.equal(row.amount, '10,000원')
  assert.deepEqual(row.apps.map((a) => a.platform).sort(), ['baemin', 'yogiyo'])
})

test('최고가 없는 브랜드(특정메뉴뿐)는 액면을 그리고 4,999 정렬값을 찍지 않는다', () => {
  const row = rowOf(brand('B', [offer('baemin', 8000, { qualifier: '특정메뉴', certainty: 'menuOnly' })]), F)
  assert.equal(row.amount, '8,000원')
  assert.ok(!row.amount.includes('4,999'))
})

test('품절은 soldOut이 참이고 금액 글자는 그대로', () => {
  const row = rowOf(brand('C', [offer('baemin', 9000, { soldOut: true })]), F)
  assert.equal(row.soldOut, true)
  assert.equal(row.amount, '9,000원')
})

test('묶음 행사는 rawText를 그린다', () => {
  const row = rowOf(brand('D', [offer('own', 15000, { kind: 'bundle', rawText: '징거버거 1+1' })]), F)
  assert.equal(row.amount, '징거버거 1+1')
})

test('조건 칸: 첫 주문이 채널보다 앞, 나머지는 +n', () => {
  const o = offer('baemin', 10000, { conditions: '첫 주문', tiers: [{ amount: 10000, channel: '포장' }] })
  const c = conditionOf(o)
  assert.equal(c.text, '첫 주문')
  assert.equal(c.more, 1)
  assert.deepEqual(c.all, ['첫 주문', '포장'])
})

test('칩 없는 오퍼는 조건이 null', () => {
  const c = conditionOf(offer('baemin', 10000))
  assert.equal(c.text, null)
  assert.equal(c.more, 0)
})

test('최소주문: 0은 없음, 숫자는 원↑, 모르면 정식 라벨(칸을 비우지 않는다)', () => {
  assert.equal(minText({ minOrderAmount: 0 }), '최소주문 없음')
  assert.equal(minText({ minOrderAmount: 15000 }), '15,000원↑')
  assert.equal(minText({ minOrderAmount: null }), '최소주문 미확인')
  assert.equal(minText({}), '최소주문 미확인')
})

test('확인 시각: 가장 최근 값을 한국 시각으로, UTC 15시는 다음 날 0시', () => {
  const brands = [
    brand('A', [offer('baemin', 10000, { capturedAt: '2026-11-02T03:00:00Z' })]),
    brand('B', [offer('baemin', 10000, { capturedAt: '2026-11-02T15:00:00Z' }), offer('yogiyo', 9000)]),
  ]
  assert.equal(checkedAt(brands), '11.03 00:00')
})

test('확인 시각이 모두 없으면 null(현재 시각을 대신 쓰지 않는다)', () => {
  assert.equal(checkedAt([brand('A', [offer('baemin', 10000)])]), null)
  assert.equal(capturedLabel('깨진 값'), null)
})

test('링크는 offerLink(offer, brand.links, brand.name) 인자 순서', () => {
  const b = brand('치킨집', [offer('baemin', 10000)], { links: { baemin: 'baemin://brand/1' } })
  const row = rowOf(b, F)
  assert.equal(row.href, offerLink(b.offers[0], b.links, b.name))
  assert.equal(row.href, 'baemin://brand/1')
})

test('buildRows: 5천원 미만 브랜드는 빠지고 분류를 고르면 그 분류만', () => {
  const brands = [
    brand('치킨1', [offer('baemin', 10000)], { category: 'chicken' }),
    brand('피자1', [offer('baemin', 9000)], { category: 'pizza' }),
    brand('작은할인', [offer('baemin', 3000)], { category: 'chicken' }),
  ]
  assert.deepEqual(buildRows(brands).map((r) => r.name), ['치킨1', '피자1'])
  assert.deepEqual(buildRows(brands, 'pizza').map((r) => r.name), ['피자1'])
})
