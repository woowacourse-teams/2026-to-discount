import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, bestConfirmedAmount, comparable, defaultFilters, sortBrands } from './filters.js'

const brand = (name, offers, extra = {}) => ({ name, offers, ...extra })
const o = (amount, extra = {}) => ({ amount, platform: 'baemin', ...extra })

test('특정메뉴 쿠폰은 넣기를 켰을 때만 최고 할인 산정에 든다(2026-09-19)', () => {
  const offers = [o(3000), o(9000, { qualifier: '특정메뉴' })]
  assert.equal(bestConfirmedAmount(offers), 3000)
  assert.equal(bestConfirmedAmount(offers, { menu: true }), 9000)
  assert.equal(bestConfirmedAmount(offers, { random: true }), 3000)
  assert.equal(comparable(o(1, { qualifier: '랜덤' }), true), true)   // 예전 호출(랜덤만)
})

test('정렬 우선순위는 고른 순서가 아니라 고정이다: 그 외 → 할인금액 → 최소주문금액', () => {
  const brands = [
    brand('가', [o(5000, { minOrderAmount: 10000 })]),
    brand('나', [o(5000, { minOrderAmount: 20000 })]),
    brand('다', [o(7000, { minOrderAmount: 30000 })]),
  ]
  // 최소주문 낮은순을 먼저 골라도 할인금액이 앞선다.
  const sorts = [{ key: 'minOrder', dir: 'asc' }, { key: 'amount', dir: 'desc' }]
  assert.deepEqual(sortBrands(brands, { sorts }).map((b) => b.name), ['다', '가', '나'])
})

test('인기순을 고르면 기본으로 켜진 할인금액보다 앞선다 — 눌렀는데 화면이 안 바뀌면 안 된다', () => {
  const brands = [
    brand('가', [o(9000)], { popularity: 1 }),
    brand('나', [o(3000)], { popularity: 50 }),
  ]
  const sorts = [{ key: 'amount', dir: 'desc' }, { key: 'popularity', dir: 'desc' }]
  assert.deepEqual(sortBrands(brands, { sorts }).map((b) => b.name), ['나', '가'])
})

test('자사 오퍼는 플랫폼 필터 밖이다 - 배달앱을 다 꺼도 남는다', () => {
  const brands = [{
    name: '백억커피',
    category: 'cafe',
    offers: [
      { platform: 'own', amount: 5000, certainty: 'exact', kind: 'cashback' },
      { platform: 'baemin', amount: 3000, certainty: 'exact', kind: 'discount' },
    ],
  }]
  const all = defaultFilters()
  assert.equal(applyFilters(brands, all)[0].offers.length, 2)

  // 필터가 고르는 것은 "어느 배달앱으로 시킬까"다. 자사 행사는 그 질문의 답이 아니다.
  const none = { ...defaultFilters(), platforms: new Set() }
  const left = applyFilters(brands, none)
  assert.equal(left.length, 1)
  assert.deepEqual(left[0].offers.map((o) => o.platform), ['own'])
})

test('자사 오퍼가 없는 브랜드는 플랫폼을 다 끄면 그대로 사라진다', () => {
  const brands = [{
    name: '어느치킨',
    category: 'chicken',
    offers: [{ platform: 'baemin', amount: 4000, certainty: 'exact', kind: 'discount' }],
  }]
  const none = { ...defaultFilters(), platforms: new Set() }
  assert.equal(applyFilters(brands, none).length, 0)
})
