import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters } from '../../filters.js'
import {
  amountLabel, buildCards, cardOf, minText, splitAmount, splitMin, detailOf, polyPaths,
} from './data.js'

const offer = (o) => ({ platform: 'baemin', amount: 10000, minOrderAmount: 15000, ...o })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', offers, ...extra })

test('금액 문구: 일반 오퍼는 "n원 할인", 묶음 행사는 원문 그대로', () => {
  assert.equal(amountLabel(offer({})), '10,000원 할인')
  assert.equal(amountLabel(offer({ kind: 'bundle', amount: 15000, rawText: '징거버거 1+1' })), '징거버거 1+1')
  assert.equal(amountLabel(offer({ amount: null, rawText: '쿠폰 증정' })), '쿠폰 증정')
  assert.equal(amountLabel(offer({ amount: null, rawText: undefined })), '-')
})

test('최소주문: 숫자, 0, null이 각각 N원 이상 주문시, 최소주문 없음, 최소주문 미확인', () => {
  assert.equal(minText(15000), '15,000원 이상 주문시')
  assert.equal(minText(0), '최소주문 없음')
  assert.equal(minText(null), '최소주문 미확인')
  assert.equal(minText(undefined), '최소주문 미확인')
})

test('카드 순서는 applyFilters 결과와 같다', () => {
  const brands = [
    brand('가', [offer({ amount: 6000 })]),
    brand('나', [offer({ amount: 12000 })]),
    brand('다', [offer({ amount: 9000 })]),
    brand('라', [offer({ amount: 3000 })]), // 기본 필터는 5천원 미만을 빼지 않는다(2026-11-10부터)
  ]
  const want = applyFilters(brands, defaultFilters()).map((b) => b.name)
  assert.deepEqual(buildCards(brands).map((c) => c.name), want)
  assert.deepEqual(want, ['나', '다', '가', '라'])
})

test('카드: 앱 이름, 최소주문 모름, 분류 필터', () => {
  const b = brand('가', [offer({ platform: 'coupangeats', minOrderAmount: null })])
  const card = cardOf(b, { random: false, menu: false })
  assert.equal(card.appLabel, '쿠팡이츠')
  assert.equal(card.minLabel, '최소주문 미확인')
  assert.equal(card.amountLabel, '10,000원 할인')
  assert.equal(buildCards([b], ['pizza']).length, 0)
  assert.equal(buildCards([b], ['chicken']).length, 1)
})

test('금액 가르기: "n원 할인"은 숫자와 나머지로, 그 밖의 원문은 그대로(null)', () => {
  assert.deepEqual(splitAmount('12,000원 할인'), { num: '12,000', rest: '원 할인' })
  assert.deepEqual(splitAmount('20% 할인'), { num: '20', rest: '% 할인' })
  assert.equal(splitAmount('1+1'), null)
  assert.equal(splitAmount('-'), null)
})

test('최소주문 가르기: "n원 이상"과 "주문시", 그 밖의 문구는 null', () => {
  assert.deepEqual(splitMin(minText(15000)), { amt: '15,000원 이상', rest: ' 주문시' })
  assert.equal(splitMin(minText(0)), null)
  assert.equal(splitMin(minText(null)), null)
})

test('자세히 보기: 중복 쿠폰의 합산식은 숨기고 결과 금액과 최소주문만 보인다(값은 그대로)', () => {
  const combo = offer({
    platform: 'yogiyo', qualifier: '최적', amount: 7000, minOrderAmount: 30000,
    tiers: [{ amount: 5000, minOrder: 20000 }, { amount: 7000, minOrder: 30000, channel: '배달' }],
  })
  const rows = detailOf(brand('가', [combo]), { random: false, menu: false })[0].rows
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r) => r.extra === ''), '합산식(5,000+2,000)이 남았다')
  assert.equal(rows[0].amount, '7,000원')
  assert.equal(rows[0].min, '30,000원 이상 주문시')
})

test('꺾은선: 직선(L)으로만 잇고 값 없는 날에서 끊는다(곡선 C 없음)', () => {
  const { solid, area } = polyPaths([{ x: 0, y: 10 }, { x: 10, y: 4 }, { x: 20, y: null }, { x: 30, y: 8 }, { x: 40, y: 2 }], 100)
  assert.deepEqual(solid, ['M0 10 L10 4', 'M30 8 L40 2'])
  assert.ok(solid.every((p) => !p.includes('C')))
  assert.equal(area[0], 'M0 10 L10 4 V100 H0 Z')
})

test('카드: 1+1 묶음 행사는 대표와 따로 bundles에 담기고, 묶음뿐인 브랜드는 그것이 대표', () => {
  const bundle = offer({ kind: 'bundle', amount: 15000, rawText: '징거버거 1+1', platform: 'baemin' })
  const mixed = cardOf(brand('가', [offer({ amount: 6000 }), bundle]), { random: false, menu: false })
  assert.equal(mixed.bundles.length, 1)
  assert.equal(mixed.bundles[0].label, '징거버거 1+1')
  assert.equal(mixed.amountLabel, '6,000원 할인')
  const only = cardOf(brand('나', [bundle]), { random: false, menu: false })
  assert.equal(only.bundles.length, 0)
  assert.equal(only.amountLabel, '징거버거 1+1')
  assert.equal(only.hasBest, false)
})
