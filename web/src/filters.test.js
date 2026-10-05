import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apiFile } from '../scripts/api-repo.mjs'
import {
  applyFilters, bestConfirmedAmount, certaintyOf, comparable, defaultFilters, isBestCandidate, isDefaultFilters,
  displayBestAmount, offerKey, sortBrands, sortingAmount,
  hasNewBest,
} from './filters.js'

const brand = (name, offers, extra = {}) => ({ name, offers, ...extra })
const o = (amount, extra = {}) => ({ amount, platform: 'baemin', ...extra })

test('특정메뉴 쿠폰은 넣기를 꺼도 정렬 천장(4,999원)엔 든다. 켜야 액면으로 오른다(2026-09-19, 2026-09-23 정정)', () => {
  // fix round 1: 예전엔 토글이 꺼지면 이 오퍼가 통째로 빠져 bestConfirmedAmount가
  // 3000을 냈다. api의 comparisonAmount는 토글을 모르고 특정메뉴를 늘 4,999원
  // 천장으로 센다(OfferComparison.java 주석) - 그 값이 3000보다 커 여기서도 4999가
  // 맞다. 이 쿠폰만 있는 브랜드가 정렬 기준을 잃던 문제(critical)의 증거이기도 하다.
  // certainty로 직접 적는다(2026-09-23) - qualifier만으로는 더는 menuOnly/random이
  // 안 나온다(RULES 11로 웹의 qualifier 다리를 뗐다). 실제 API 응답은 항상
  // certainty를 같이 낸다.
  const offers = [o(3000), o(9000, { qualifier: '특정메뉴', certainty: 'menuOnly' })]
  assert.equal(bestConfirmedAmount(offers), 4999)
  assert.equal(bestConfirmedAmount(offers, { menu: true }), 9000)
  assert.equal(bestConfirmedAmount(offers, { random: true }), 4999)
  assert.equal(comparable(o(1, { qualifier: '랜덤', certainty: 'random' }), true), true)   // 예전 호출(랜덤만)
})

test('특정메뉴 쿠폰뿐인 브랜드도 정렬 천장을 잃지 않는다(fix round 1 critical)', () => {
  assert.equal(bestConfirmedAmount([o(14000, { certainty: 'menuOnly' })]), 4999)
  assert.equal(bestConfirmedAmount([o(14000, { certainty: 'menuOnly' })], { menu: true }), 14000)
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
  // 이 테스트는 플랫폼 필터만 본다. 5천원 이상만(2026-10-03부터 기본 켜짐)은 끈다.
  const all = { ...defaultFilters(), minAmount5k: false }
  assert.equal(applyFilters(brands, all)[0].offers.length, 2)

  // 필터가 고르는 것은 "어느 배달앱으로 시킬까"다. 자사 행사는 그 질문의 답이 아니다.
  const none = { ...defaultFilters(), minAmount5k: false, platforms: new Set() }
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

test('판정표를 API와 같이 읽는다 - 규칙을 두 벌 적지 않는다(ADR-016)', () => {
  // 판정표의 정본은 API 저장소다(scripts/api-repo.mjs). 못 찾으면 실패한다.
  // 2026-09-29 전에는 없으면 건너뛰고 강제를 mono CI에 맡겼는데, 운영 정본이 개인
  // 저장소로 옮겨오면서 그 자리가 사라졌다. 건너뛴 테스트는 초록으로 보인다.
  const table = JSON.parse(
    readFileSync(apiFile('src', 'test', 'resources', 'contracts', 'certainty-cases.json'), 'utf8'))
  const { cases } = table
  assert.ok(cases.length >= 8, '판정표가 비었거나 줄었다')
  for (const c of cases) {
    const offer = { certainty: c.certainty, kind: c.kind, soldOut: c.soldOut, amount: c.amount }
    assert.equal(isBestCandidate(offer), c.best, JSON.stringify(c))
    assert.equal(sortingAmount(offer), c.sorting, JSON.stringify(c))
  }
})

test('certainty를 그대로 읽는다. 안 오면 exact다(2026-09-23, RULES 11로 qualifier 다리를 뗐다)', () => {
  // Task 8부터 API가 certainty를 항상 낸다 - qualifier에서 끌어내는 다리는 웹에
  // 더는 없다(Offer.qualifier 자체는 원장 호환으로 API에 남는다). qualifier만
  // 있고 certainty가 없는 오퍼도 이제는 그냥 exact다 - "안 오면 qualifier로
  // 읽는다"던 옛 동작이 바로 이 테스트가 지웠던 그 동작이다.
  assert.equal(certaintyOf({ certainty: 'capped' }), 'capped')
  assert.equal(certaintyOf({ qualifier: '최대' }), 'exact')
  assert.equal(certaintyOf({}), 'exact')
})

test('캐시백은 최고 할인 후보가 아니다 - 액면으로 견줄 수 없다', () => {
  const offers = [
    o(3000, { certainty: 'exact', kind: 'discount' }),
    o(9000, { certainty: 'exact', kind: 'cashback' }),
  ]
  assert.equal(bestConfirmedAmount(offers), 3000)
})

test('자사(own) 오퍼는 금액이 커도 최고 할인 후보가 아니다 - 배달앱끼리만 겨룬다', () => {
  const offers = [
    o(3000, { certainty: 'exact', kind: 'discount', platform: 'baemin' }),
    o(9000, { certainty: 'exact', kind: 'discount', platform: 'own' }),
  ]
  assert.equal(bestConfirmedAmount(offers), 3000)
  assert.equal(isBestCandidate(offers[1]), false)
})

test('넣기를 켠 랜덤은 판정표의 기본값과 달리 최고 후보에 낀다 - 토글은 표 위의 사용자 예외다', () => {
  const random = o(7000, { certainty: 'random', kind: 'discount' })
  assert.equal(isBestCandidate(random), false) // 표의 기본값: 안 낀다
  assert.equal(comparable(random, { random: true }), true) // 사용자가 켰다
  assert.equal(comparable(random, false), false)
})

test('오퍼 키는 같은 앱의 확정과 랜덤을 가른다', () => {
  // 서버 slot과 같은 기준이다 - BrandComparisonService가 platform#random으로 가른다.
  const exact = { platform: 'coupangeats', certainty: 'exact' }
  const random = { platform: 'coupangeats', certainty: 'random' }
  assert.equal(offerKey(exact), 'coupangeats')
  assert.equal(offerKey(random), 'coupangeats#random')
  assert.notEqual(offerKey(exact), offerKey(random))
})

test('오퍼 키는 선착순 배너를 상시 할인과 가른다', () => {
  // 2026-09-30: 서버가 선착순 배너를 platform#first-come 칸에 따로 세운다. 같은 키면 React가
  // 둘 중 하나를 지우거나 엉뚱한 자리에 다시 그린다.
  const standing = { platform: 'coupangeats', certainty: 'exact' }
  const firstCome = { platform: 'coupangeats', certainty: 'capped', firstCome: true, fromBanner: true }
  assert.equal(offerKey(firstCome), 'coupangeats#first-come')
  assert.notEqual(offerKey(standing), offerKey(firstCome))
})

test('화면에 찍을 최고액은 특정메뉴 천장값(4,999원)을 쓰지 않는다', () => {
  // 정렬용 sortingAmount는 특정메뉴뿐인 브랜드에 4,999원을 끼운다. 그 값이 화면에
  // 가격처럼 찍히면 안 된다 - 토글이 꺼져 있으면 아예 없고, 켜면 액면이 나온다.
  const menuOnly = [{ platform: 'baemin', certainty: 'menuOnly', amount: 12100 }]
  assert.equal(displayBestAmount(menuOnly, false), null)
  assert.equal(displayBestAmount(menuOnly, { menu: true }), 12100)
  assert.equal(displayBestAmount([{ platform: 'baemin', certainty: 'exact', amount: 8000, soldOut: true }]), null)
})


test('5천원 이상만은 기본으로 켜져 있고, 검색 중에는 금액으로 거르지 않는다', () => {
  // 2026-10-03 사용자: 최소주문 낮은순으로 보면 너무 작은 할인이 앞을 채웠다.
  const brands = [
    { name: '디디치킨', category: 'chicken', offers: [{ platform: 'baemin', amount: 2000, certainty: 'exact', kind: 'discount' }] },
    { name: '청년피자', category: 'pizza', offers: [{ platform: 'baemin', amount: 7500, certainty: 'exact', kind: 'discount' }] },
  ]
  const f = defaultFilters()
  assert.equal(f.minAmount5k, true)
  assert.deepEqual(applyFilters(brands, f).map((b) => b.name), ['청년피자'])
  // 이름으로 찾았는데 금액 때문에 안 보이면 없는 줄 안다.
  assert.deepEqual(applyFilters(brands, { ...f, search: '디디' }).map((b) => b.name), ['디디치킨'])
})

test('멤버십: 끄면 그 멤버십 전용 오퍼만 빠지고, 기본(둘 다 켜짐)은 그대로', () => {
  const brands = [{ name: 'BBQ', category: 'chicken', offers: [
    { platform: 'baemin', amount: 7000, membership: 'baeminClub' },
    { platform: 'baemin', amount: 6000, membership: 'none' },
    { platform: 'coupangeats', amount: 8000, membership: 'coupangEats' },
  ] }]
  const all = applyFilters(brands, defaultFilters())
  assert.equal(all[0].offers.length, 3)
  const noClub = applyFilters(brands, { ...defaultFilters(), memberships: new Set(['coupangeats']) })
  assert.deepEqual(noClub[0].offers.map((o) => o.amount).sort(), [6000, 8000])
  assert.equal(isDefaultFilters({ ...defaultFilters(), memberships: new Set(['coupangeats']) }), false)
})

test('업데이트만: 오늘 처음 본 오퍼가 있는 브랜드만 남긴다', () => {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  const brands = [
    { name: 'A', category: 'pizza', offers: [{ platform: 'baemin', amount: 7000, firstSeenAt: `${today}T00:30:00+09:00` }] },
    { name: 'B', category: 'pizza', offers: [{ platform: 'baemin', amount: 7000, firstSeenAt: '2026-09-01T00:30:00+09:00' }] },
  ]
  assert.deepEqual(applyFilters(brands, { ...defaultFilters(), updatedOnly: true }).map((b) => b.name), ['A'])
  assert.equal(applyFilters(brands, defaultFilters()).length, 2)
})

test('신규 탭: 최고 오퍼가 신규일 때만', () => {
  const now = new Date().toISOString()
  const old = { platform: 'baemin', amount: 9000, firstSeenAt: '2026-01-01T00:00:00+09:00', capturedAt: now }
  const fresh = { platform: 'yogiyo', amount: 2000, firstSeenAt: now, capturedAt: now }
  assert.equal(hasNewBest([old, fresh]), false)
  assert.equal(hasNewBest([{ ...fresh, amount: 9500 }, old]), true)
})
