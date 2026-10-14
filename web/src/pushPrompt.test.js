import assert from 'node:assert/strict'
import test from 'node:test'
import { declinePrompt, recordPromptVisit, hasSeenOfferPrompt, recordOfferPromptSeen } from './pushPrompt.js'

function storage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('첫 방문에는 숨기고 재방문부터 세 번만 표시한다', () => {
  const value = storage()
  assert.equal(recordPromptVisit(value), false)
  assert.equal(recordPromptVisit(value), true)
  assert.equal(recordPromptVisit(value), true)
  assert.equal(recordPromptVisit(value), true)
  assert.equal(recordPromptVisit(value), false)
})

test('거절하면 이후 방문에는 표시하지 않는다', () => {
  const value = storage()
  recordPromptVisit(value)
  declinePrompt(value)
  assert.equal(recordPromptVisit(value), false)
})

test('다른 탭이나 앱으로 이동한 동안에는 노출 1회를 소진하지 않는다', () => {
  const value = storage()
  assert.equal(recordOfferPromptSeen({ visible: false, focused: true }, value), false)
  assert.equal(recordOfferPromptSeen({ visible: true, focused: false }, value), false)
  assert.equal(hasSeenOfferPrompt(value), false)
  assert.equal(recordOfferPromptSeen({ visible: true, focused: true }, value), true)
  assert.equal(hasSeenOfferPrompt(value), true)
})

test('노출 저장소가 차단되어도 안내 확인 처리는 실패하지 않는다', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(hasSeenOfferPrompt(blocked), false)
  assert.equal(recordOfferPromptSeen({ visible: true, focused: true }, blocked), true)
})
