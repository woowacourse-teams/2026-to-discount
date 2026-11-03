import test from 'node:test'
import assert from 'node:assert/strict'
import { PLATFORMS, UNKNOWN_MIN_TEXT, capturedLabel, cellState, overallCaptured, rowOf, rowsOf } from './data.js'
import { offerLink, COUPANGEATS_LINK } from '../../offerLink.js'

const offer = (platform, amount, minOrderAmount, extra = {}) => ({
  platform, amount, minOrderAmount, certainty: 'exact', kind: 'discount', ...extra,
})
const brand = (offers, extra = {}) => ({ name: '테스트치킨', category: '치킨', offers, links: {}, ...extra })
const stateOf = (row) => Object.fromEntries(row.cells.map((c) => [c.platform, c.state]))

test('칸 순서는 PLATFORMS 순서로 항상 네 칸', () => {
  const row = rowOf(brand([offer('yogiyo', 6000, 10000)]), 20000)
  assert.deepEqual(row.cells.map((c) => c.platform), PLATFORMS.map((p) => p.key))
  assert.equal(row.cells.length, 4)
})

test('상태 다섯: none, unknown, blocked, ok, best', () => {
  const row = rowOf(brand([
    offer('baemin', 9000, 15000),        // best
    offer('coupangeats', 7000, null),    // unknown
    offer('yogiyo', 5000, 18000),        // ok
  ]), 20000)
  assert.deepEqual(stateOf(row), { baemin: 'best', coupangeats: 'unknown', ddangyo: 'none', yogiyo: 'ok' })
  const blocked = rowOf(brand([offer('baemin', 9000, 30000)]), 20000)
  assert.equal(stateOf(blocked).baemin, 'blocked')
})

test('최소주문 0은 ok, 문턱과 주문 금액이 같으면 ok(경계)', () => {
  assert.equal(cellState(offer('baemin', 5000, 0), 10000), 'ok')
  assert.equal(cellState(offer('baemin', 5000, 20000), 20000), 'ok')
  assert.equal(cellState(offer('baemin', 5000, 20001), 20000), 'blocked')
  assert.equal(cellState(null, 20000), 'none')
})

test('동점이면 best 둘 다', () => {
  const row = rowOf(brand([offer('baemin', 8000, 10000), offer('yogiyo', 8000, 12000), offer('ddangyo', 5000, 0)]), 20000)
  assert.deepEqual(stateOf(row), { baemin: 'best', coupangeats: 'none', ddangyo: 'ok', yogiyo: 'best' })
})

test('best는 받는 칸(ok) 중에서만: 큰 금액이 blocked면 작은 ok가 best', () => {
  const row = rowOf(brand([offer('baemin', 12000, 40000), offer('yogiyo', 4000, 10000)]), 20000)
  assert.deepEqual(stateOf(row), { baemin: 'blocked', coupangeats: 'none', ddangyo: 'none', yogiyo: 'best' })
})

test('모름(unknown)은 best 후보가 아니다', () => {
  const row = rowOf(brand([offer('coupangeats', 9000, null)]), 20000)
  assert.equal(stateOf(row).coupangeats, 'unknown')
  assert.ok(!row.cells.some((c) => c.state === 'best'))
})

test('없음과 모름은 다르게: 없음은 minText 없음, 모름은 최소주문 미확인', () => {
  const row = rowOf(brand([offer('baemin', 9000, null)]), 20000)
  const none = row.cells.find((c) => c.platform === 'yogiyo')
  const unknown = row.cells.find((c) => c.platform === 'baemin')
  assert.equal(none.minText, null)
  assert.equal(unknown.minText, UNKNOWN_MIN_TEXT)
  assert.equal(UNKNOWN_MIN_TEXT, '최소주문 미확인')
  assert.notEqual(none.minText, unknown.minText)
})

test('최소주문 문구: 값 있으면 최소주문 n원, 0이면 최소주문 없음', () => {
  const row = rowOf(brand([offer('baemin', 9000, 15000), offer('yogiyo', 9000, 0)]), 20000)
  assert.equal(row.cells[0].minText, '최소주문 15,000원')
  assert.equal(row.cells[3].minText, '최소주문 없음')
})

test('후보 제외: 품절, 불확정, 랜덤, 묶음 행사는 best가 되지 않는다', () => {
  const sold = rowOf(brand([offer('baemin', 9000, 0, { soldOut: true })]), 20000)
  assert.equal(stateOf(sold).baemin, 'ok')
  const capped = rowOf(brand([offer('baemin', 9000, 0, { certainty: 'capped', qualifier: '최대' })]), 20000)
  assert.equal(stateOf(capped).baemin, 'ok')
  assert.ok(capped.cells[0].chips.some((c) => c.text === '불확정'))
  const random = rowOf(brand([offer('baemin', 9000, 0, { certainty: 'random', qualifier: '랜덤' })]), 20000)
  assert.equal(stateOf(random).baemin, 'ok')
  const bundle = rowOf(brand([offer('baemin', 15000, 0, { kind: 'bundle', rawText: '버거 1+1' })]), 20000)
  assert.equal(stateOf(bundle).baemin, 'ok')
  assert.equal(bundle.cells[0].amountText, '버거 1+1')
})

test('불확정 오퍼가 더 커도 확정 오퍼가 best', () => {
  const row = rowOf(brand([
    offer('baemin', 20000, 0, { certainty: 'capped', qualifier: '최대' }),
    offer('yogiyo', 5000, 0),
  ]), 20000)
  assert.deepEqual(stateOf(row), { baemin: 'ok', coupangeats: 'none', ddangyo: 'none', yogiyo: 'best' })
})

test('링크는 offerLink의 결과와 같다(쿠팡이츠는 COUPANGEATS_LINK 폴백)', () => {
  const b = brand([offer('coupangeats', 7000, 10000), offer('baemin', 6000, 10000, { link: 'baemin://x' })], { links: { yogiyo: 'https://y' } })
  const row = rowOf(b, 20000)
  const ce = row.cells.find((c) => c.platform === 'coupangeats')
  assert.equal(ce.href, offerLink(ce.offer, b.links, b.name))
  assert.equal(ce.href, COUPANGEATS_LINK)
  assert.equal(row.cells[0].href, 'baemin://x')
  assert.equal(row.cells.find((c) => c.platform === 'ddangyo').href, null)
})

test('시각: UTC를 한국 시각으로, 자정 경계는 다음 날 00:30', () => {
  assert.equal(capturedLabel('2026-11-02T15:30:00Z'), '11.03 00:30')
  assert.equal(capturedLabel('2026-11-03T03:05:00Z'), '11.03 12:05')
  assert.equal(capturedLabel(null), null)
  assert.equal(capturedLabel('tomorrow'), null)
})

test('기준 시각: 줄은 그 브랜드의 가장 늦은 값, 전체는 모든 브랜드 중 가장 늦은 값', () => {
  const a = brand([offer('baemin', 9000, 0, { capturedAt: '2026-11-03T01:00:00Z' }), offer('yogiyo', 9000, 0, { capturedAt: '2026-11-03T02:00:00Z' })])
  const b = brand([offer('baemin', 9000, 0, { capturedAt: '2026-11-03T04:00:00Z' })], { name: '다른집' })
  assert.equal(rowOf(a, 20000).capturedAt, '2026-11-03T02:00:00Z')
  assert.equal(overallCaptured([a, b]), '2026-11-03T04:00:00Z')
  assert.equal(rowOf(brand([offer('baemin', 9000, 0)]), 20000).capturedAt, null)
})

test('rowsOf: 분류로 거르고 5천원 미만 오퍼는 칸에서 빠진다', () => {
  const rows = rowsOf([
    brand([offer('baemin', 9000, 0), offer('yogiyo', 3000, 0)]),
    brand([offer('baemin', 9000, 0)], { name: '카페집', category: '카페' }),
  ], 20000, new Set(['치킨']))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].cells.find((c) => c.platform === 'yogiyo').state, 'none')
})
