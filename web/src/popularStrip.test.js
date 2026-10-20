import test from 'node:test'
import assert from 'node:assert/strict'
import { popularToday } from './popularStrip.js'

test('오늘 인기는 누른 사람 많은 순 다섯, 0명은 빼고', () => {
  const b = (name, popularityToday) => ({ name, popularityToday })
  const got = popularToday([b('a', 1), b('b', 9), b('c', 0), b('d', 4), b('e', 2), b('f', 7), b('g', 3), { name: 'h' }])
  assert.deepEqual(got.map((x) => x.brand.name), ['b', 'f', 'd', 'g', 'e'])
  assert.deepEqual(popularToday(null), [])
})

test('등락은 직전 갱신 때 순위와의 차이, 없던 브랜드는 null(새로 듦)', () => {
  const b = (name, popularityToday, popularityPrevious) => ({ name, popularityToday, popularityPrevious })
  const got = popularToday([b('a', 9, 1), b('b', 5, 8), b('c', 3, 0), b('d', 2, 2)])
  // 직전 순위: b 1, d 2, a 3. 오늘: a 1, b 2, c 3, d 4
  assert.deepEqual(got.map((x) => [x.brand.name, x.rank, x.change]), [['a', 1, 2], ['b', 2, -1], ['c', 3, null], ['d', 4, -2]])
})

test('같은 사람 수는 같은 순위, 다음 순위는 그만큼 건너뛴다(직전에 둘 다 1위, 지금 둘 다 2위면 내림 1)', () => {
  const b = (name, popularityToday, popularityPrevious = 0) => ({ name, popularityToday, popularityPrevious })
  const got = popularToday([b('a', 9), b('b', 7, 5), b('c', 7, 5), b('d', 2)])
  assert.deepEqual(got.map((x) => [x.brand.name, x.rank, x.change]), [['a', 1, null], ['b', 2, -1], ['c', 2, -1], ['d', 4, null]])
})

test('직전 20위 밖은 몇 위였든 21위로 친다', () => {
  const b = (name, popularityToday, popularityPrevious) => ({ name, popularityToday, popularityPrevious })
  const many = Array.from({ length: 30 }, (_, i) => b(`y${i}`, 0, 40 - i))
  const got = popularToday([...many, b('cu', 4, 1), b('a', 9, 50), b('b', 8, 49), b('c', 7, 48)])
  assert.deepEqual(got.map((x) => [x.brand.name, x.rank, x.change]), [['a', 1, 0], ['b', 2, 0], ['c', 3, 0], ['cu', 4, 17]])
})
test('변동은 공동 순위 칸 수를 빼고 센다(직전 1명짜리가 공동 순위 뒤에 밀려도 진짜 순위 차이만)', () => {
  const b = (name, popularityToday, popularityPrevious) => ({ name, popularityToday, popularityPrevious })
  // 직전: x 9, y 5, 1명짜리 열 곳(공동 3위, 경쟁 순위로는 3위지만 그 뒤가 13위로 밀린다), cu 1명
  const ones = Array.from({ length: 10 }, (_, i) => b(`o${i}`, 0, 1))
  const got = popularToday([b('x', 9, 9), b('y', 7, 5), b('cu', 4, 1), ...ones])
  assert.deepEqual(got.map((r) => [r.brand.name, r.rank, r.change]), [['x', 1, 0], ['y', 2, 0], ['cu', 3, 0]])
})
test('서버가 popularityPrevious를 아직 안 주면 등락은 0 — 전부 새로 든 것으로 보이지 않는다', () => {
  const got = popularToday([{ name: 'a', popularityToday: 9 }, { name: 'b', popularityToday: 5 }, { name: 'c', popularityToday: 3 }])
  assert.deepEqual(got.map((x) => x.change), [0, 0, 0])
})

test('순위가 직전과 같으면 등락이 없다(갱신 주기마다 초기화)', () => {
  const b = (name, popularityToday, popularityPrevious) => ({ name, popularityToday, popularityPrevious })
  const got = popularToday([b('a', 9, 8), b('b', 7, 6), b('c', 5, 5)])   // 사람 수는 늘었지만 순위는 그대로
  assert.deepEqual(got.map((x) => x.change), [0, 0, 0])
})