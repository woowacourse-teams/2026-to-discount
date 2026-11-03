import test from 'node:test'
import assert from 'node:assert/strict'
import { savingsRows, settle, minText, capturedLabel } from './data.js'

const offer = (platform, amount, minOrderAmount, extra = {}) => ({ platform, amount, minOrderAmount, ...extra })
const brand = (name, offers, category = 'chicken') => ({ name, category, offers })
const names = (rows) => rows.map((r) => r.name)

test('최소주문이 입력 금액 이하면 든다. 경계(==)도 든다', () => {
  const { ranked } = savingsRows([brand('가', [offer('baemin', 6000, 20000)])], 20000)
  assert.deepEqual(names(ranked), ['가'])
  assert.equal(ranked[0].best.amount, 6000)
  assert.equal(settle(offer('baemin', 6000, 20000), 20000), 'ok')
})

test('최소주문이 입력 금액보다 크면 안 든다. 그 앱 칸은 over', () => {
  const b = brand('가', [offer('baemin', 6000, 15000), offer('yogiyo', 9000, 25000)])
  const { ranked } = savingsRows([b], 20000)
  assert.equal(ranked[0].best.amount, 6000)
  const yogiyo = ranked[0].apps.find((a) => a.platform.key === 'yogiyo')
  assert.equal(yogiyo.state, 'over')
  assert.equal(yogiyo.minText, '최소주문 25,000원')
})

test('최소주문 모름은 순위에 안 들고 unknown으로 나간다. 오퍼 없음(none)과 다르다', () => {
  const b = brand('가', [offer('baemin', 9000, null)])
  const { ranked, unknown } = savingsRows([b], 20000)
  assert.deepEqual(names(ranked), [])
  assert.deepEqual(names(unknown), ['가'])
  assert.equal(unknown[0].best.minText, '최소주문 미확인')
  const states = Object.fromEntries(unknown[0].apps.map((a) => [a.platform.key, a.state]))
  assert.equal(states.baemin, 'unknown')
  assert.equal(states.yogiyo, 'none')
  assert.equal(settle(offer('baemin', 9000, null), 20000), 'unknown')
})

test('받을 수 있는 할인이 있으면 같은 브랜드는 unknown에 또 나오지 않는다', () => {
  const b = brand('가', [offer('baemin', 6000, 10000), offer('yogiyo', 9000, null)])
  const { ranked, unknown } = savingsRows([b], 20000)
  assert.deepEqual(names(ranked), ['가'])
  assert.deepEqual(names(unknown), [])
})

test('특정메뉴 쿠폰만 있는 브랜드는 목록에 없다(4,999가 안 나온다)', () => {
  const b = brand('가', [offer('baemin', 8000, 10000, { certainty: 'menuOnly', qualifier: '특정메뉴' })])
  const { ranked, unknown } = savingsRows([b], 20000)
  assert.deepEqual(names(ranked), [])
  assert.deepEqual(names(unknown), [])
})

test('정렬은 큰 숫자 내림차순, 같으면 이름순', () => {
  const list = [
    brand('나', [offer('baemin', 6000, 10000)]),
    brand('다', [offer('baemin', 9000, 10000)]),
    brand('가', [offer('baemin', 6000, 10000)]),
  ]
  assert.deepEqual(names(savingsRows(list, 20000).ranked), ['다', '가', '나'])
})

test('입력 금액을 바꾸면 큰 숫자가 달라진다', () => {
  const b = brand('가', [offer('baemin', 9000, 18000), offer('yogiyo', 6000, 10000)])
  assert.equal(savingsRows([b], 20000).ranked[0].best.amount, 9000)
  assert.equal(savingsRows([b], 10000).ranked[0].best.amount, 6000)
})

test('받을 수 있는 할인이 0건이면 가장 낮은 최소주문을 낸다', () => {
  const b = brand('가', [offer('baemin', 6000, 15000), offer('yogiyo', 9000, 25000)])
  const r = savingsRows([b], 10000)
  assert.deepEqual(names(r.ranked), [])
  assert.equal(r.lowestMin, 15000)
})

test('분류를 고르면 그 분류만', () => {
  const list = [brand('가', [offer('baemin', 6000, 1000)], 'chicken'), brand('나', [offer('baemin', 6000, 1000)], 'pizza')]
  assert.deepEqual(names(savingsRows(list, 20000, new Set(['pizza'])).ranked), ['나'])
})

test('minText와 capturedLabel', () => {
  assert.equal(minText({ minOrderAmount: 0 }), '최소주문 없음')
  assert.equal(capturedLabel(null), null)
  assert.equal(capturedLabel('2026-11-03T05:05:00Z'), '11월 3일 14:05 기준')
  assert.equal(capturedLabel('알 수 없는 형식'), '알 수 없는 형식')
})
