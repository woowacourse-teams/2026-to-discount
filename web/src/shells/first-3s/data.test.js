import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHome, brandView, capturedAgo, capturedDate, minInfo, offerView, MIN_UNKNOWN } from './data.js'
import { offerLink } from '../../offerLink.js'

const o = (amount, extra = {}) => ({ amount, platform: 'baemin', certainty: 'exact', minOrderAmount: 15000, ...extra })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', offers, links: {}, ...extra })

test('모름과 없음이 다르게 나온다: 최소주문 null은 기존 라벨, 오퍼 없는 앱은 none', () => {
  assert.deepEqual(minInfo(o(6000, { minOrderAmount: null })), { kind: 'unknown', label: MIN_UNKNOWN })
  assert.equal(MIN_UNKNOWN, '최소주문 미확인')
  const v = brandView(brand('가', [o(6000, { minOrderAmount: null })]), {})
  const baemin = v.apps.find((a) => a.key === 'baemin')
  const yogiyo = v.apps.find((a) => a.key === 'yogiyo')
  assert.equal(baemin.kind, 'value')
  assert.equal(baemin.min.kind, 'unknown')
  assert.equal(yogiyo.kind, 'none')
  assert.notDeepEqual(baemin, yogiyo)
})

test('최소주문 0은 "최소주문 없음", null과 갈린다. 숫자는 원↑', () => {
  assert.deepEqual(minInfo(o(6000, { minOrderAmount: 0 })), { kind: 'value', label: '최소주문 없음' })
  assert.notEqual(minInfo(o(6000, { minOrderAmount: 0 })).kind, 'unknown')
  assert.equal(minInfo(o(6000, { minOrderAmount: 15000 })).label, '15,000원↑')
})

test('최고가 없으면(불확정뿐) 히어로가 비고 목록에는 남는다', () => {
  const capped = brand('불확정', [o(9000, { certainty: 'capped', qualifier: '최대' })])
  const home = buildHome([capped])
  assert.equal(home.hero, null)
  assert.equal(home.list.length, 1)
  assert.equal(home.list[0].hasBest, false)
})

test('히어로는 목록 순서에서 hasBest가 참인 첫 브랜드이고 목록에서 빠진다', () => {
  const capped = brand('불확정', [o(20000, { certainty: 'capped', qualifier: '최대' })])
  const big = brand('큰할인', [o(9000)])
  const small = brand('작은할인', [o(6000)])
  const home = buildHome([capped, small, big])
  assert.equal(home.hero.name, '큰할인')
  assert.equal(home.hero.main.amount, '9,000원')
  assert.deepEqual(home.list.map((c) => c.name).sort(), ['불확정', '작은할인'].sort())
})

test('조건이 숨지 않는다: "첫 주문"은 칩, 그 밖 문장은 note', () => {
  const first = offerView(o(6000, { conditions: '첫 주문' }), brand('가', []))
  assert.ok(first.chips.some((c) => c.text === '첫 주문'))
  assert.equal(first.note, '')
  const monthly = offerView(o(6000, { conditions: '1일 1회, 배달만' }), brand('가', []))
  assert.equal(monthly.note, '1일 1회, 배달만')
  assert.ok(!monthly.chips.some((c) => c.text === '1일 1회, 배달만'))
})

test('링크는 offerLink와 같다. 쿠팡이츠는 앱 또는 공유 링크 꼴', () => {
  const links = { baemin: 'baemin://x' }
  const b = brand('가', [], { links })
  const bm = o(6000)
  assert.equal(offerView(bm, b).href, offerLink(bm, links, '가'))
  const ce = o(6000, { platform: 'coupangeats' })
  const href = offerView(ce, b).href
  assert.equal(href, offerLink(ce, links, '가'))
  assert.match(href, /^(coupangeats:\/\/|https:\/\/share\.coupangeats\.com\/)/)
})

test('빈 목록은 히어로 없이 empty를 낸다. 예외를 던지지 않는다', () => {
  for (const input of [[], null, undefined]) {
    const home = buildHome(input)
    assert.equal(home.hero, null)
    assert.deepEqual(home.list, [])
    assert.equal(home.empty, true)
  }
  // 기본 필터(5천원 이상)가 모두 걸러도 마찬가지다
  assert.equal(buildHome([brand('싼', [o(1000)])]).empty, true)
})

test('금액을 모르면 원문, 그것도 없으면 칸을 비우지 않는다', () => {
  assert.equal(offerView(o(null, { rawText: '최대 1만원' }), brand('가', [])).amount, '최대 1만원')
  assert.equal(offerView(o(null), brand('가', [])).amount, '금액 ?')
})

test('시각 표시: KST 날짜, 분/시간 전, 못 읽는 값은 null', () => {
  assert.equal(capturedDate('2026-11-03T00:30:00Z'), '11.03 09:30')
  const now = Date.parse('2026-11-03T01:00:00Z')
  assert.equal(capturedAgo('2026-11-03T00:30:00Z', now), '30분 전')
  assert.equal(capturedAgo('2026-11-02T23:00:00Z', now), '2시간 전')
  assert.equal(capturedAgo('2026-11-01T00:00:00Z', now), '11.01 09:00')
  assert.equal(capturedAgo('nope', now), null)
  assert.equal(capturedDate(null), null)
})
