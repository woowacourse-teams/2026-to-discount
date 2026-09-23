import assert from 'node:assert/strict'
import test from 'node:test'
import { declinePrompt, recordPromptVisit } from './pushPrompt.js'

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
