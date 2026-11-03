import test from 'node:test'
import assert from 'node:assert/strict'
import { cardOf, minTextOf, openAppsOf, popularOf, stateOf, updatedAtOf } from './data.js'

const offer = (over) => ({ platform: 'baemin', amount: 6000, minOrderAmount: 15000, ...over })

test('오퍼가 없는 앱 칸은 -, 값이 있으면 금액', () => {
  const card = cardOf({ name: '테스트치킨', offers: [offer({})] })
  const byKey = Object.fromEntries(card.apps.map((a) => [a.platform, a]))
  assert.equal(byKey.baemin.none, false)
  assert.equal(byKey.baemin.text, '6,000원')
  assert.equal(byKey.coupangeats.text, '-')
  assert.equal(byKey.coupangeats.none, true)
})

test('최소주문을 모르면 미확인 라벨, 0이면 없음, 값이면 금액. 셋을 같은 빈 칸으로 그리지 않는다', () => {
  assert.equal(minTextOf(offer({ minOrderAmount: null })), '최소주문 미확인')
  assert.equal(minTextOf(offer({ minOrderAmount: undefined })), '최소주문 미확인')
  assert.equal(minTextOf(offer({ minOrderAmount: 0 })), '최소주문 없음')
  assert.equal(minTextOf(offer({ minOrderAmount: 15000 })), '최소주문 15,000원')
  assert.equal(cardOf({ name: 'x', offers: [offer({ minOrderAmount: null })] }).min, '최소주문 미확인')
})

test('updatedAtOf는 브랜드 여럿 중 가장 큰 capturedAt, 하나도 없으면 null', () => {
  const brands = [
    { name: 'a', offers: [offer({ capturedAt: '2026-11-03T01:00:00Z' }), offer({ capturedAt: '2026-11-03T03:00:00Z' })] },
    { name: 'b', offers: [offer({ capturedAt: '2026-11-03T02:00:00Z' })] },
    { name: 'c', offers: [offer({})] },
  ]
  assert.equal(updatedAtOf(brands), '2026-11-03T03:00:00Z')
  assert.equal(updatedAtOf([{ name: 'c', offers: [offer({})] }]), null)
  assert.equal(updatedAtOf([]), null)
})

test('?state= 허용 목록 밖의 값은 없는 것으로 친다', () => {
  assert.equal(stateOf('?state=stale'), 'stale')
  assert.equal(stateOf('?state=empty'), 'empty')
  assert.equal(stateOf('?state=error'), 'error')
  assert.equal(stateOf('?state=ok'), null)
  assert.equal(stateOf('?state=constructor'), null)
  assert.equal(stateOf(''), null)
  assert.equal(stateOf(undefined), null)
})

test('인기 띠는 세 곳이 안 되면 비운다', () => {
  assert.deepEqual(popularOf([]), [])
  assert.deepEqual(popularOf([{ name: 'a', offers: [offer({})], popularityToday: 3 }]), [])
})

test('앱 열기 링크에는 undefined가 섞이지 않는다', () => {
  const apps = openAppsOf()
  assert.ok(apps.length > 0)
  for (const a of apps) {
    assert.equal(typeof a.href, 'string')
    assert.ok(!a.href.includes('undefined'), a.href)
  }
})
