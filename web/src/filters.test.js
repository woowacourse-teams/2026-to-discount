import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyFilters, bestConfirmedAmount, certaintyOf, comparable, defaultFilters, isBestCandidate,
  displayBestAmount, offerKey, sortBrands, sortingAmount,
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

test('판정표를 API와 같이 읽는다 - 규칙을 두 벌 적지 않는다(ADR-016)', (t) => {
  // 배포 미러(nn98/delivery-discount-api)는 api/만 가져가 docs/가 없다.
  // 파일이 없으면 이 테스트만 건너뛴다 - RULES 3. t.skip으로 건너뛰어야
  // 러너의 skipped 집계에 잡힌다 - console.log와 return만으로는 단언 0개짜리
  // ✔가 찍혀 표가 통째로 빠졌다는 사실이 안 보인다(fix round 1).
  let table
  try {
    table = JSON.parse(
      readFileSync(new URL('../../docs/contracts/certainty-cases.json', import.meta.url), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      t.skip('certainty-cases.json 없음 - 배포 미러라 건너뜀')
      return
    }
    throw err
  }
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

test('화면에 찍을 최고액은 특정메뉴 천장값(4,999원)을 쓰지 않는다', () => {
  // 정렬용 sortingAmount는 특정메뉴뿐인 브랜드에 4,999원을 끼운다. 그 값이 화면에
  // 가격처럼 찍히면 안 된다 - 토글이 꺼져 있으면 아예 없고, 켜면 액면이 나온다.
  const menuOnly = [{ platform: 'baemin', certainty: 'menuOnly', amount: 12100 }]
  assert.equal(displayBestAmount(menuOnly, false), null)
  assert.equal(displayBestAmount(menuOnly, { menu: true }), 12100)
  assert.equal(displayBestAmount([{ platform: 'baemin', certainty: 'exact', amount: 8000, soldOut: true }]), null)
})
