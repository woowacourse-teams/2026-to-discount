import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, defaultFilters, CATEGORIES } from '../../filters.js'
import { homeCards, imageFor, stampLabel, topCards } from './data.js'

const offer = (o) => ({ platform: 'baemin', amount: 7000, minOrderAmount: 15000, certainty: 'exact', ...o })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', links: {}, offers, ...extra })

test('앱에 오퍼가 없으면 -, 금액을 모르면 금액 ?', () => {
  const b = brand('A', [
    offer({ platform: 'baemin', amount: 9000 }),
    offer({ platform: 'yogiyo', amount: null, rawText: null, bundle: false, kind: 'bundle' }),
  ])
  const [card] = homeCards([b])
  const by = Object.fromEntries(card.apps.map((a) => [a.key, a.text]))
  assert.equal(by.baemin, '9,000원')
  assert.equal(by.coupangeats, '-')
  assert.equal(by.ddangyo, '-')
  assert.equal(by.yogiyo, '금액 ?')
  assert.equal(card.apps.length, 4)
})

test('최소주문: null은 미확인, 0은 없음, 숫자는 원↑', () => {
  const cardOf = (min) => homeCards([brand('A', [offer({ minOrderAmount: min })])])[0]
  assert.equal(cardOf(null).minLabel, '최소주문 미확인')
  assert.equal(cardOf(0).minLabel, '최소주문 없음')
  assert.equal(cardOf(15000).minLabel, '15,000원↑')
})

test('금액이 있으면 원 할인으로 끝나고 묶음 행사는 rawText 그대로', () => {
  const [a] = homeCards([brand('A', [offer({ amount: 8000 })])])
  assert.equal(a.amountLabel, '8,000원 할인')
  const [b] = homeCards([brand('B', [offer({ kind: 'bundle', amount: 15000, rawText: '징거버거 1+1' })])])
  assert.equal(b.amountLabel, '징거버거 1+1')
})

test('3장 카드는 applyFilters 결과의 앞 3개와 같다', () => {
  const brands = ['가', '나', '다', '라', '마'].map((n, i) => brand(n, [offer({ amount: 5000 + i * 1000 })]))
  const expected = applyFilters(brands, defaultFilters()).slice(0, 3).map((b) => b.name)
  const cards = homeCards(brands)
  assert.deepEqual(topCards(cards).map((c) => c.brand.name), expected)
  assert.equal(topCards(cards).length, 3)
})

test('imageFor는 모든 카테고리와 모르는 키에 그라데이션과 이모지를 돌려준다', () => {
  for (const key of [...CATEGORIES.map((c) => c.key), 'nope', undefined]) {
    const look = imageFor({ category: key })
    assert.ok(look.gradient.startsWith('linear-gradient'), String(key))
    assert.ok(look.emoji, String(key))
  }
})

test('certainty와 popularity 칸이 없는 응답에서도 죽지 않는다', () => {
  const o = { platform: 'baemin', amount: 6000 }
  assert.equal(homeCards([{ name: 'X', offers: [o] }]).length, 1)
})

test('갱신 시각은 한국 시간 M.D HH:mm 기준, 못 읽으면 null', () => {
  assert.equal(stampLabel('2026-11-03T00:05:00Z'), '11.3 09:05 기준')
  assert.equal(stampLabel(null), null)
  assert.equal(stampLabel('abc'), null)
})
