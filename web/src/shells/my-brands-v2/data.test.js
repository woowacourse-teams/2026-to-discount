import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters } from '../../filters.js'
import {
  agoLabel, amountLabel, buildCards, cardOf, minText, readStars, splitStars, writeStars, STARS_KEY,
} from './data.js'

const offer = (o) => ({ platform: 'baemin', amount: 10000, minOrderAmount: 15000, ...o })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', offers, ...extra })

test('금액 문구: 일반 오퍼는 "n원 할인", 묶음 행사는 원문 그대로', () => {
  assert.equal(amountLabel(offer({})), '10,000원 할인')
  assert.equal(amountLabel(offer({ kind: 'bundle', amount: 15000, rawText: '징거버거 1+1' })), '징거버거 1+1')
  assert.equal(amountLabel(offer({ amount: null, rawText: '쿠폰 증정' })), '쿠폰 증정')
  assert.equal(amountLabel(offer({ amount: null, rawText: undefined })), '-')
})

test('최소주문: 숫자, 0, null이 각각 N원↑, 최소주문 없음, 최소주문 미확인', () => {
  assert.equal(minText(15000), '15,000원↑')
  assert.equal(minText(0), '최소주문 없음')
  assert.equal(minText(null), '최소주문 미확인')
  assert.equal(minText(undefined), '최소주문 미확인')
})

test('카드 순서는 applyFilters 결과와 같다(별이 없을 때)', () => {
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

test('별: 켜진 브랜드만 위로, 각 묶음 안 순서는 그대로', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name }))
  assert.deepEqual(splitStars(cards, new Set(['d', 'b'])).map((c) => c.name), ['b', 'd', 'a', 'c', 'e'])
  assert.deepEqual(splitStars(cards, new Set()).map((c) => c.name), ['a', 'b', 'c', 'd', 'e'])
})

test('별 저장: 읽고 쓰고, 저장소가 막혀도 멈추지 않는다', () => {
  const mem = new Map()
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  writeStars(new Set(['a', 'b']), storage)
  assert.deepEqual([...readStars(storage)], ['a', 'b'])
  assert.equal(STARS_KEY, 'dk_v2_stars')
  const blocked = { getItem() { throw new Error('막힘') }, setItem() { throw new Error('막힘') } }
  assert.equal(readStars(blocked).size, 0)
  assert.doesNotThrow(() => writeStars(new Set(['a']), blocked))
  mem.set(STARS_KEY, '{깨짐')
  assert.equal(readStars(storage).size, 0)
})

test('상대 시각: 모르면 null', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  assert.equal(agoLabel(null, now), null)
  assert.equal(agoLabel('이상한 값', now), null)
  assert.equal(agoLabel('2026-11-03T11:55:00Z', now), '5분 전')
  assert.equal(agoLabel('2026-11-03T09:00:00Z', now), '3시간 전')
})
