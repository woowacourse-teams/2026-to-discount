import test from 'node:test'
import assert from 'node:assert/strict'
import { popularToday } from './popularStrip.js'

test('오늘 인기는 누른 사람 많은 순 다섯, 0명은 빼고', () => {
  const b = (name, popularityToday) => ({ name, popularityToday })
  const got = popularToday([b('a', 1), b('b', 9), b('c', 0), b('d', 4), b('e', 2), b('f', 7), b('g', 3), { name: 'h' }])
  assert.deepEqual(got.map((x) => x.brand.name), ['b', 'f', 'd', 'g', 'e'])
  assert.deepEqual(popularToday(null), [])
})

test('등락은 그 전 24시간 순위와의 차이, 없던 브랜드는 어제 21위로 친다', () => {
  const b = (name, popularityToday, popularityYesterday) => ({ name, popularityToday, popularityYesterday })
  const got = popularToday([b('a', 9, 1), b('b', 5, 8), b('c', 3, 0), b('d', 2, 2)])
  // 어제 순위: b 1, d 2, a 3. 오늘: a 1, b 2, c 3, d 4
  assert.deepEqual(got.map((x) => [x.brand.name, x.rank, x.change]), [['a', 1, 2], ['b', 2, -1], ['c', 3, 18], ['d', 4, -2]])
})

test('같은 사람 수는 같은 순위, 다음 순위는 그만큼 건너뛴다(어제 둘 다 1위, 오늘 둘 다 2위면 내림 1)', () => {
  const b = (name, popularityToday, popularityYesterday = 0) => ({ name, popularityToday, popularityYesterday })
  const got = popularToday([b('a', 9), b('b', 7, 5), b('c', 7, 5), b('d', 2)])
  assert.deepEqual(got.map((x) => [x.brand.name, x.rank, x.change]), [['a', 1, 20], ['b', 2, -1], ['c', 2, -1], ['d', 4, 18]])
})

test('어제 20위 밖은 몇 위였든 21위로 친다', () => {
  const b = (name, popularityToday, popularityYesterday) => ({ name, popularityToday, popularityYesterday })
  const many = Array.from({ length: 30 }, (_, i) => b(`y${i}`, 0, 40 - i))
  const got = popularToday([...many, b('cu', 4, 1), b('a', 9, 50), b('b', 8, 49), b('c', 7, 48)])
  assert.deepEqual(got.map((x) => [x.brand.name, x.rank, x.change]), [['a', 1, 0], ['b', 2, 0], ['c', 3, 0], ['cu', 4, 17]])
})
test('변동은 공동 순위 칸 수를 빼고 센다(어제 1명짜리가 공동 순위 뒤에 밀려도 진짜 순위 차이만)', () => {
  const b = (name, popularityToday, popularityYesterday) => ({ name, popularityToday, popularityYesterday })
  // 어제: x 9, y 5, 1명짜리 열 곳(공동 3위, 경쟁 순위로는 3위지만 그 뒤가 13위로 밀린다), cu 1명
  const ones = Array.from({ length: 10 }, (_, i) => b(`o${i}`, 0, 1))
  const got = popularToday([b('x', 9, 9), b('y', 7, 5), b('cu', 4, 1), ...ones])
  assert.deepEqual(got.map((r) => [r.brand.name, r.rank, r.change]), [['x', 1, 0], ['y', 2, 0], ['cu', 3, 0]])
})