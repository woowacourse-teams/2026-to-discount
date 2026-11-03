import assert from 'node:assert/strict'
import test from 'node:test'
import { cardOf, frequentBrands, MIN_UNKNOWN, NONE } from './data.js'
import { displayBestAmount } from '../../filters.js'

const offer = (platform, extra = {}) => ({ platform, amount: 5000, minOrderAmount: 15000, capturedAt: '2026-11-03T01:00:00Z', ...extra })
const brand = (name, offers, extra = {}) => ({ name, category: '치킨', offers, links: {}, ...extra })
const byKey = (card) => Object.fromEntries(card.apps.map((a) => [a.platform.key, a]))

test('앱 칸: 오퍼 없음, 금액 모름, 금액 있음이 서로 다른 state로 나온다', () => {
  const card = cardOf(brand('가게', [
    offer('baemin'),
    offer('yogiyo', { amount: null, rawText: null }),
  ]))
  const apps = byKey(card)
  assert.equal(card.apps.length, 4)
  assert.equal(apps.baemin.state, 'known')
  assert.equal(apps.yogiyo.state, 'unknownAmount')
  assert.equal(apps.ddangyo.state, 'none')
  assert.equal(apps.ddangyo.text, NONE)
  assert.notEqual(apps.yogiyo.text, NONE)
  assert.notEqual(apps.yogiyo.state, apps.ddangyo.state)
})

test('minText: null은 미확인, 0은 없음, 숫자는 원↑', () => {
  const apps = byKey(cardOf(brand('가게', [
    offer('baemin', { minOrderAmount: null }),
    offer('yogiyo', { minOrderAmount: 0 }),
    offer('ddangyo', { minOrderAmount: 7000 }),
  ])))
  assert.equal(apps.baemin.minText, MIN_UNKNOWN)
  assert.equal(apps.yogiyo.minText, '최소주문 없음')
  assert.equal(apps.ddangyo.minText, '7,000원↑')
})

test('대표 금액은 특정메뉴 정렬값 4,999를 찍지 않는다', () => {
  const offers = [offer('baemin', { amount: 3000, qualifier: '특정메뉴', certainty: 'menuOnly' })]
  const card = cardOf(brand('메뉴가게', offers))
  assert.equal(card.amount, displayBestAmount(offers))
  assert.notEqual(card.amount, 4999)
})

test('checkedAt은 가장 늦은 수집 시각, 오퍼가 없으면 null', () => {
  const card = cardOf(brand('가게', [offer('baemin', { capturedAt: '2026-11-01T00:00:00Z' }), offer('yogiyo')]))
  assert.equal(card.checkedAt, '2026-11-03T01:00:00Z')
  assert.equal(cardOf(brand('빈집', [])).checkedAt, null)
})

test('frequentBrands: 인기 3곳 미만이면 기본 정렬 앞 다섯, 이상이면 인기 순서', () => {
  const many = Array.from({ length: 8 }, (_, i) => brand(`b${i}`, [offer('baemin', { amount: 1000 * (i + 1) })]))
  const fallback = frequentBrands(many)
  assert.equal(fallback.length, 5)
  assert.equal(fallback[0].name, 'b7') // 할인액 높은 순

  const popular = many.map((b, i) => ({ ...b, popularityToday: i === 1 ? 9 : i === 2 ? 7 : i === 3 ? 5 : 0 }))
  assert.deepEqual(frequentBrands(popular).map((b) => b.name), ['b1', 'b2', 'b3'])
})
