import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agoText, lastChecked } from './data.js'

const NOW = Date.parse('2026-11-03T12:00:00+09:00')
const before = (sec) => new Date(NOW - sec * 1000).toISOString()

test('agoText 경계', () => {
  assert.equal(agoText(before(59), NOW), '방금')
  assert.equal(agoText(before(60), NOW), '1분 전')
  assert.equal(agoText(before(59 * 60), NOW), '59분 전')
  assert.equal(agoText(before(3600), NOW), '1시간 전')
  assert.equal(agoText(before(86399), NOW), '23시간 전')
  assert.match(agoText(before(86400), NOW), /^\d+월 \d+일$/)
})

test('agoText 미래와 못 읽는 값은 null', () => {
  assert.equal(agoText(before(-5), NOW), null)
  assert.equal(agoText('어제쯤', NOW), null)
  assert.equal(agoText(undefined, NOW), null)
})

test('lastChecked', () => {
  assert.equal(lastChecked([]), null)
  assert.equal(lastChecked([{ offers: [] }]), null)
  const a = '2026-11-03T10:00:00+09:00'
  const b = '2026-11-03T11:00:00+09:00'
  assert.equal(lastChecked([{ offers: [{ capturedAt: a }] }, { offers: [{ capturedAt: b }, {}] }]), b)
  assert.equal(lastChecked([{ offers: [{ capturedAt: b }] }, { offers: [{ capturedAt: b }] }]), b)
})
