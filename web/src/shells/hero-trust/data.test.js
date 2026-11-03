import test from 'node:test'
import assert from 'node:assert/strict'
import { agoText } from './data.js'

const NOW = Date.parse('2026-11-03T12:00:00Z')

test('분, 시간, 일 전 갱신 글자', () => {
  assert.equal(agoText('2026-11-03T11:55:00Z', NOW), '5분 전 갱신')
  assert.equal(agoText('2026-11-03T09:00:00Z', NOW), '3시간 전 갱신')
  assert.equal(agoText('2026-11-01T12:00:00Z', NOW), '2일 전 갱신')
})

test('시각을 모르면 null', () => {
  assert.equal(agoText(null, NOW), null)
  assert.equal(agoText('못읽음', NOW), null)
})
