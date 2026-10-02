// 배너 노출·클릭이 같은 속성을 싣는다(2026-10-02). 금액은 원 단위 숫자로도.
import test from 'node:test'
import assert from 'node:assert/strict'
import { amountKind, amountWon, bannerProps, isOpened } from './bannerAnalytics.js'

test('금액 문구를 원 단위 숫자로(여러 값이면 가장 큰 값)', () => {
  assert.equal(amountWon('7,000원'), 7000)
  assert.equal(amountWon('최대 8,000원'), 8000)
  assert.equal(amountWon('6/5/5천원'), 6000)
  assert.equal(amountWon('1만원'), 10000)
  assert.equal(amountWon('3%'), null)
  assert.equal(amountWon(null), null)
})

test('금액 꼴', () => {
  assert.equal(amountKind('최대 8,000원'), 'max')
  assert.equal(amountKind('6/5/5천원'), 'multi')
  assert.equal(amountKind('7,000원'), 'fixed')
  assert.equal(amountKind(undefined), 'none')
})

test('선착순 열림 여부', () => {
  const at = new Date(2026, 9, 2, 10, 30)
  assert.equal(isOpened('09:00', at), true)
  assert.equal(isOpened('11:00', at), false)
  assert.equal(isOpened(null, at), null)
})

test('공통 속성', () => {
  const p = bannerProps({ id: 'x', platform: 'coupangeats', brand: 'bhc', amount: '8,000원',
    firstCome: 'issue', minOrder: 18000, group: 'g1',
    members: [{ opensAt: '17:00' }, { opensAt: '11:00' }] },
  new Date(2026, 9, 2, 10, 0))
  assert.equal(p.amount_won, 8000)
  assert.equal(p.first_come, 'issue')
  assert.equal(p.opens_at, '11:00')
  assert.equal(p.opened, false)
  assert.equal(p.member_count, 2)
  assert.equal(p.group, 'g1')
})
