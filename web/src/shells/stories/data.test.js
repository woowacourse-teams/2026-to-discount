import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters } from '../../filters.js'
import { conditionTable } from '../../couponModel.js'
import { AMOUNT_UNKNOWN, MIN_UNKNOWN, NONE, capturedText, minText, toCard, toStories } from './data.js'

const offer = (o) => ({ platform: 'baemin', amount: 6000, minOrderAmount: 15000, certainty: 'exact', kind: 'discount', capturedAt: '2026-11-03T01:30:00Z', ...o })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', offers, links: {}, ...extra })

const many = Array.from({ length: 13 }, (_, i) => brand(`브랜드${i}`, [offer({ amount: 5000 + i * 500 })]))
const menuOnly = brand('메뉴만', [offer({ amount: 9000, certainty: 'menuOnly', qualifier: '특정메뉴' })])
const fixture = [...many, menuOnly]

test('덱은 10곳이고 운영 목록(applyFilters) 앞 10곳과 순서가 같다', () => {
  const { deck } = toStories(fixture)
  const expected = applyFilters(fixture, defaultFilters()).slice(0, 10).map((b) => b.name)
  assert.equal(deck.length, 10)
  assert.deepEqual(deck.map((c) => c.name), expected.filter((n) => n !== '메뉴만'))
  assert.equal(deck[0].name, '브랜드12') // 가장 큰 금액이 첫 장 — 빈 배열끼리 같아 초록이 되지 않게
})

test('확정 없는 브랜드(특정메뉴뿐)는 덱에 끼지 않는다', () => {
  const { deck, list } = toStories(fixture)
  assert.ok(!deck.some((c) => c.name === '메뉴만'))
  assert.ok(list.some((c) => c.name === '메뉴만'), '목록에는 남는다')
})

test('최소주문을 모르는 오퍼는 "최소주문 미확인"이고 conditionTable 정본과 같은 문자열이다', () => {
  const o = offer({
    amount: 8000, minOrderAmount: 20000,
    tiers: [{ amount: 8000, minOrder: 20000 }, { amount: 3000, minOrder: null, channel: '포장' }],
  })
  const unknownRow = conditionTable(o).rows.find((r) => r.amount === '3,000원')
  assert.equal(unknownRow.min, MIN_UNKNOWN)
  assert.equal(minText(offer({ minOrderAmount: null })), unknownRow.min)
  assert.equal(minText(offer({ minOrderAmount: 20000 })), conditionTable(o).rows.find((r) => r.amount === '8,000원').min)
  assert.equal(minText(offer({ minOrderAmount: 0 })), '최소주문 없음')
})

test('앱에 오퍼가 없으면 "-", 금액을 모르면 "금액 ?"이고 둘은 다르다', () => {
  const b = brand('앱줄', [offer({ platform: 'baemin' }), offer({ platform: 'yogiyo', amount: null, rawText: '', certainty: 'capped' })])
  // 금액 없는 오퍼는 운영 5천원 거르기가 먼저 빼므로 toCard를 직접 부른다.
  const card = toCard(b, { random: false, menu: false })
  const byKey = Object.fromEntries(card.rows.map((r) => [r.key, r]))
  assert.equal(byKey.coupangeats.amount, NONE)
  assert.equal(byKey.yogiyo.amount, AMOUNT_UNKNOWN)
  assert.equal(byKey.baemin.amount, '6,000원')
  assert.notEqual(NONE, AMOUNT_UNKNOWN)
})

test('묶음 행사뿐인 브랜드의 큰 금액은 원문이다', () => {
  const b = brand('묶음', [offer({ kind: 'bundle', amount: 15000, rawText: '징거버거 1+1', certainty: 'exact' })])
  const { list } = toStories([b])
  assert.equal(list[0].amount, '징거버거 1+1')
})

test('capturedAt이 없으면 시각 줄이 없고, 있으면 KST로 MM.DD HH:mm 기준', () => {
  const none = brand('시각없음', [offer({ capturedAt: undefined })])
  assert.equal(toStories([none]).list[0].captured, null)
  assert.equal(capturedText('2026-11-03T01:30:00Z'), '11.03 10:30 기준')
  assert.equal(capturedText('2026-11-03T15:05:00Z'), '11.04 00:05 기준')
})
