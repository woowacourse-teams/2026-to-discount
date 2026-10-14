import test from 'node:test'
import assert from 'node:assert/strict'
import { readRecent, rememberBrand } from './recentBrands.js'

const memory = () => {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }
}

test('최근 누른 브랜드는 최근 순, 겹침 없이, 20개까지', () => {
  const s = memory()
  rememberBrand('bhc', s)
  rememberBrand('BBQ', s)
  rememberBrand('bhc', s)
  assert.deepEqual(readRecent(s), ['bhc', 'BBQ'])
  for (let i = 0; i < 30; i++) rememberBrand(`b${i}`, s)
  assert.equal(readRecent(s).length, 20)
  assert.equal(readRecent(s)[0], 'b29')
})

test('브랜드가 없거나 저장소가 깨져도 빈 목록', () => {
  const s = memory()
  rememberBrand('none', s)
  rememberBrand(undefined, s)
  assert.deepEqual(readRecent(s), [])
  s.setItem('dk_recent_brands', '{깨짐')
  assert.deepEqual(readRecent(s), [])
  assert.deepEqual(readRecent(null), [])
})
