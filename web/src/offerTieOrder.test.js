// #351 동점 가르기: 최소주문 → 채널 → 멤버십 → 플랫폼. 설계 docs/design/351-offer-tie-break-order.md
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOffers } from './couponModel.js'
import { sortBrands, applyFilters, defaultFilters, compareOfferTie } from './filters.js'

const o = (platform, amount, extra = {}) => ({ platform, amount, certainty: 'exact', kind: 'discount', ...extra })
const brand = (name, offers, extra = {}) => ({ name, offers, ...extra })
const names = (bs) => bs.map((b) => b.name)
const byAmount = { sorts: [{ key: 'amount', dir: 'desc' }] }

test('채널만 다름: 없음, 배달, 포장', () => {
  const r = splitOffers([
    o('baemin', 5000, { minOrderAmount: 15000, badge: '포장 전용' }),
    o('baemin', 5000, { minOrderAmount: 15000, badge: '배달 전용' }),
    o('baemin', 5000, { minOrderAmount: 15000 }),
  ], null)
  assert.deepEqual(r.best.map((x) => x.badge ?? null), [null, '배달 전용', '포장 전용'])
})

test('배달/포장은 채널 없음과 같은 자리, 배달보다 앞', () => {
  const r = splitOffers([
    o('baemin', 5000, { badge: '배달 전용' }),
    o('baemin', 5000, { tiers: [{ amount: 5000, channel: '배달/포장' }] }),
  ], null)
  assert.equal(r.best[0].tiers?.[0].channel, '배달/포장')
})

test('멤버십만 다름: 조건 없음(칸 없음 포함)이 앞', () => {
  const r = splitOffers([
    o('baemin', 5000, { membership: 'baeminClub' }),
    o('baemin', 5000, { membership: 'none' }),
    o('baemin', 5000, { membership: 'baeminClub', id: 2 }),
    o('baemin', 5000, { id: 3 }),
  ], null)
  assert.deepEqual(r.best.map((x) => x.membership ?? null), ['none', null, 'baeminClub', 'baeminClub'])
})

test('플랫폼만 다름: 배민, 쿠팡이츠, 요기요, 땡겨요', () => {
  const r = splitOffers(['ddangyo', 'yogiyo', 'coupangeats', 'baemin'].map((p) => o(p, 5000)), null)
  assert.deepEqual(r.best.map((x) => x.platform), ['baemin', 'coupangeats', 'yogiyo', 'ddangyo'])
})

test('최소주문 null이 맨 뒤', () => {
  const r = splitOffers([30000, null, 10000].map((m) => o('baemin', 5000, { minOrderAmount: m })), null)
  assert.deepEqual(r.best.map((x) => x.minOrderAmount), [10000, 30000, null])
})

test('앞 키가 뒤 키를 이긴다: 최소주문 낮은 포장이 높은 무관보다 앞', () => {
  const r = splitOffers([
    o('baemin', 5000, { minOrderAmount: 20000 }),
    o('baemin', 5000, { minOrderAmount: 10000, badge: '포장 전용' }),
  ], null)
  assert.deepEqual(r.best.map((x) => x.minOrderAmount), [10000, 20000])
})

test('나머지 줄도 같은 규칙', () => {
  const r = splitOffers([
    o('baemin', 10000),
    o('baemin', 5000, { badge: '포장 전용' }),
    o('baemin', 9000, { qualifier: '최대' }),
    o('baemin', 5000),
  ], null)
  assert.deepEqual(r.rest.map((x) => [x.amount, x.badge ?? null]), [[5000, null], [5000, '포장 전용'], [9000, null]])
})

test('카드 동점에서 신규가 첫 장', () => {
  const r = splitOffers([
    o('baemin', 5000, { minOrderAmount: 10000, isNew: false }),
    o('ddangyo', 5000, { minOrderAmount: 20000, isNew: true }),
  ], null)
  assert.equal(r.best[0].platform, 'ddangyo')
})

test('브랜드 목록: 금액이 같으면 대표 오퍼 키로 가른다(이름순이면 가가 앞)', () => {
  const bs = [brand('가', [o('baemin', 3000, { badge: '포장 전용' })]), brand('나', [o('baemin', 3000)])]
  assert.deepEqual(names(sortBrands(bs, byAmount)), ['나', '가'])
})

test('브랜드 목록: 대표 키도 같으면 이름순', () => {
  const bs = [brand('나', [o('baemin', 3000)]), brand('가', [o('baemin', 3000)])]
  assert.deepEqual(names(sortBrands(bs, byAmount)), ['가', '나'])
})

test('브랜드 목록: 대표 없는 쪽이 뒤', () => {
  const bs = [
    brand('가', [o('baemin', 3000, { qualifier: '특정메뉴', certainty: 'menuOnly' })], { popularity: 1 }),
    brand('나', [o('baemin', 3000)], { popularity: 1 }),
  ]
  assert.deepEqual(names(sortBrands(bs, { sorts: [{ key: 'popularity', dir: 'desc' }] })), ['나', '가'])
})

test('기본 정렬: 최고 오퍼가 신규인 브랜드가 맨 위', () => {
  const bs = [
    brand('가', [o('baemin', 5000, { isNew: false })]),
    brand('하', [o('baemin', 3000, { isNew: true })]),
  ]
  assert.equal(applyFilters(bs, defaultFilters())[0].name, '하')
})

test('같은 입력은 입력 순서와 무관하게 같은 순서', () => {
  const bs = [
    brand('가', [o('baemin', 3000, { badge: '포장 전용' })]),
    brand('나', [o('baemin', 3000)]),
    brand('다', [o('yogiyo', 3000)]),
    brand('라', [o('baemin', 3000, { membership: 'baeminClub' })]),
  ]
  const want = names(sortBrands(bs, byAmount))
  for (const p of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) {
    assert.deepEqual(names(sortBrands(p.map((i) => bs[i]), byAmount)), want)
  }
})

test('compareOfferTie는 최소주문이 둘 다 null이어도 유한수', () => {
  assert.ok(Number.isFinite(compareOfferTie(o('baemin', 5000), o('baemin', 5000))))
})
