import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters } from '../../filters.js'
import {
  amountLabel, buildCards, cardOf, minText, splitAmount,
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
    brand('라', [offer({ amount: 3000 })]), // 5천원 미만은 기본 필터가 뺀다
  ]
  const want = applyFilters(brands, defaultFilters()).map((b) => b.name)
  assert.deepEqual(buildCards(brands).map((c) => c.name), want)
  assert.deepEqual(want, ['나', '다', '가'])
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
