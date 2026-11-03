import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters } from '../../filters.js'
import { conditionTable } from '../../couponModel.js'
import { offerLink, COUPANGEATS_LINK } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'
import { toRows, ago, minText, MIN_UNKNOWN } from './data.js'

const o = (platform, amount, extra = {}) => ({ platform, amount, certainty: 'exact', kind: 'discount', minOrderAmount: 15000, ...extra })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', links: {}, offers, ...extra })

const FIX = [
  brand('가게A', [o('baemin', 8000), o('yogiyo', 8000, { minOrderAmount: null }), o('ddangyo', 6000)]),
  brand('가게B', [o('coupangeats', 10000, { certainty: 'random', qualifier: '랜덤' }), o('baemin', 7000, { minOrderAmount: 0 })]),
  brand('가게C', [o('baemin', 9000, { soldOut: true }), o('ddangyo', 6000)]),
  brand('가게D', [o('yogiyo', 9500, { certainty: 'menuOnly', qualifier: '특정메뉴' }), o('baemin', 5500)]),
]

test('앱 4칸이 PLATFORMS 순서로 항상 네 칸, 오퍼 없는 앱은 none', () => {
  for (const row of toRows(FIX)) {
    assert.deepEqual(row.cells.map((c) => c.platform), PLATFORMS.map((p) => p.key))
  }
  const a = toRows(FIX).find((r) => r.name === '가게A')
  assert.equal(a.cells[1].state, 'none')
  assert.equal(a.cells[1].min, '')
  assert.equal(a.cells[0].state, 'offer')
})

test('최고 칸: 동점이면 둘 다, 랜덤과 특정메뉴와 품절은 최고가 안 된다', () => {
  const rows = Object.fromEntries(toRows(FIX).map((r) => [r.name, r]))
  assert.deepEqual(rows['가게A'].cells.map((c) => c.isBest), [true, false, false, true])
  assert.equal(rows['가게B'].bestAmount, 7000)
  assert.deepEqual(rows['가게B'].cells.map((c) => c.isBest), [true, false, false, false])
  assert.equal(rows['가게C'].bestAmount, 6000)
  assert.deepEqual(rows['가게C'].cells.map((c) => c.isBest), [false, false, true, false])
  assert.equal(rows['가게D'].bestAmount, 5500)
  assert.deepEqual(rows['가게D'].cells.map((c) => c.isBest), [true, false, false, false])
})

test('최소주문: 0은 없음, null은 미확인, 숫자는 천 단위', () => {
  assert.equal(minText({ minOrderAmount: 0 }), '최소주문 없음')
  assert.equal(minText({ minOrderAmount: null }), MIN_UNKNOWN)
  assert.equal(minText({}), MIN_UNKNOWN)
  assert.equal(minText({ minOrderAmount: 18000 }), `${(18000).toLocaleString('ko-KR')}원↑`)
})

test('미확인 상수가 conditionTable의 정식 라벨과 같다', () => {
  const t = conditionTable({ platform: 'baemin', amount: 5000, minOrderAmount: null, tiers: [{ amount: 5000, channel: '배달' }] })
  assert.equal(t.rows[0].min, MIN_UNKNOWN)
})

test('모르는 최소주문은 칸에서 비지 않고 미확인으로 그려진다, 없는 앱과 다르다', () => {
  const a = toRows(FIX).find((r) => r.name === '가게A')
  assert.equal(a.cells[3].min, MIN_UNKNOWN)
  assert.equal(a.cells[1].state, 'none')
})

test('줄 순서가 applyFilters(defaultFilters)와 같다', () => {
  const expected = applyFilters(FIX, defaultFilters()).map((b) => b.name)
  assert.deepEqual(toRows(FIX).map((r) => r.name), expected)
})

test('칸 href가 offerLink와 같다, 쿠팡이츠는 공유 링크 폴백', () => {
  const b = brand('가게E', [o('coupangeats', 9000), o('baemin', 7000)], { links: { baemin: 'https://example.test/b' } })
  const row = toRows([b])[0]
  assert.equal(row.cells[0].href, offerLink(b.offers[1], b.links, b.name))
  assert.equal(row.cells[1].href, COUPANGEATS_LINK)
  assert.equal(row.bestHref, COUPANGEATS_LINK)
  assert.ok(row.cells.filter((c) => c.state === 'offer').every((c) => c.href))
})

test('capturedAt은 가장 최근 값, 없으면 null', () => {
  const b = brand('가게F', [o('baemin', 8000, { capturedAt: '2026-11-03T01:00:00Z' }), o('yogiyo', 7000, { capturedAt: '2026-11-03T03:00:00Z' })])
  assert.equal(toRows([b])[0].capturedAt, '2026-11-03T03:00:00Z')
  assert.equal(toRows([brand('가게G', [o('baemin', 8000)])])[0].capturedAt, null)
})

test('ago: 방금, 분, 시간, 일, 못 읽으면 빈 값', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  const at = (ms) => new Date(now - ms).toISOString()
  assert.equal(ago(at(59_000), now), '방금')
  assert.equal(ago(at(5 * 60_000), now), '5분 전')
  assert.equal(ago(at(3 * 3600_000), now), '3시간 전')
  assert.equal(ago(at(2 * 86400_000), now), '2일 전')
  assert.equal(ago(at(-5000), now), '방금')
  assert.equal(ago(null, now), '')
  assert.equal(ago('아님', now), '')
  assert.doesNotThrow(() => ago(undefined, now))
})
