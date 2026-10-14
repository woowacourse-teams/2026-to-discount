import test from 'node:test'
import assert from 'node:assert/strict'
import { popularToday } from './popularStrip.js'

test('오늘 인기는 누른 사람 많은 순 다섯, 0명은 빼고', () => {
  const b = (name, popularityToday) => ({ name, popularityToday })
  const got = popularToday([b('a', 1), b('b', 9), b('c', 0), b('d', 4), b('e', 2), b('f', 7), b('g', 3), { name: 'h' }])
  assert.deepEqual(got.map((x) => x.brand.name), ['b', 'f', 'd', 'g', 'e'])
  assert.deepEqual(popularToday(null), [])
})

test('등락은 그 전 24시간 순위와의 차이, 없던 브랜드는 null', () => {
  const b = (name, popularityToday, popularityYesterday) => ({ name, popularityToday, popularityYesterday })
  const got = popularToday([b('a', 9, 1), b('b', 5, 8), b('c', 3, 0), b('d', 2, 2)])
  // 어제 순위: b 1, d 2, a 3. 오늘: a 1, b 2, c 3, d 4
  assert.deepEqual(got.map((x) => [x.brand.name, x.rank, x.change]), [['a', 1, 2], ['b', 2, -1], ['c', 3, null], ['d', 4, -2]])
})
