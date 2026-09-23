import test from 'node:test'
import assert from 'node:assert/strict'
import { iconFor, ICON_BY_KEY, PLATFORMS } from './platforms.js'

test('배달앱 넷은 그대로 찾는다', () => {
  for (const p of PLATFORMS) {
    assert.equal(iconFor(p.key, null).key, p.key)
  }
})

test('own은 아이콘이 없다 - 브랜드 로고 자리다', () => {
  // 지금 코드는 PLATFORM_BY_KEY['own'].key를 읽어 TypeError를 낸다. 웹에 에러 경계가
  // 없어서 카드 하나가 아니라 페이지 전체가 안 그려진다.
  assert.equal(iconFor('own', null), null)
  assert.equal(iconFor(undefined, null), null)
  assert.equal(iconFor('듣도보도못한앱', null), null)
})

test('via가 있으면 제휴 결제 마크가 이긴다', () => {
  assert.equal(iconFor('own', 'naverpay').key, 'naverpay')
  assert.equal(iconFor('baemin', 'naverpay').key, 'naverpay')
})

test('via는 아이콘에만 쓴다 - 필터 목록에는 안 들어간다', () => {
  assert.ok(!PLATFORMS.some((p) => p.key === 'naverpay'))
  assert.ok(ICON_BY_KEY.naverpay)
})

test('ICON_BY_KEY는 Object.prototype을 안 물려받는다 - constructor도 그냥 키다', () => {
  assert.equal(iconFor('constructor', null), null)
  assert.equal(iconFor('toString', null), null)
})
