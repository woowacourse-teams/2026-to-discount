import test from 'node:test'
import assert from 'node:assert/strict'
import { nextReaction, reactionOf, readReactions, setReaction } from './brandReactions.js'

function fakeStorage(initial = null) {
  let value = initial
  return { getItem: () => value, setItem: (_, v) => { value = v }, get raw() { return value } }
}
const blocked = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }

test('nextReaction: 표 여섯 칸', () => {
  const cases = [
    ['none', 'like', 'like'], ['none', 'dislike', 'dislike'],
    ['like', 'like', 'none'], ['like', 'dislike', 'dislike'],
    ['dislike', 'dislike', 'none'], ['dislike', 'like', 'like'],
  ]
  for (const [cur, pressed, want] of cases) assert.equal(nextReaction(cur, pressed), want, `${cur}+${pressed}`)
})

test('setReaction none은 열쇠를 지운다', () => {
  const s = fakeStorage()
  const b = { name: '교촌치킨' }
  const m1 = setReaction({}, b, 'like', s)
  assert.deepEqual(JSON.parse(s.raw), { 교촌치킨: 'like' })
  const m2 = setReaction(m1, b, 'none', s)
  assert.deepEqual(m2, {})
  assert.equal('교촌치킨' in JSON.parse(s.raw), false)
})

test('readReactions는 막힌 저장소, 깨진 값, 배열이면 빈 목록', () => {
  assert.deepEqual(readReactions(blocked), {})
  assert.deepEqual(readReactions(fakeStorage('{깨짐')), {})
  assert.deepEqual(readReactions(fakeStorage('[1]')), {})
  assert.deepEqual(readReactions(fakeStorage(null)), {})
})

test('setReaction은 저장소가 막혀도 던지지 않고 화면용 값을 돌려준다', () => {
  assert.deepEqual(setReaction({}, { name: 'a' }, 'like', blocked), { a: 'like' })
})

test('reactionOf: 대표명 먼저, 없으면 searchAliases, 둘 다 없으면 none', () => {
  const b = { name: '새이름', searchAliases: ['옛이름'] }
  assert.equal(reactionOf({ 새이름: 'dislike', 옛이름: 'like' }, b), 'dislike')
  assert.equal(reactionOf({ 옛이름: 'like' }, b), 'like')
  assert.equal(reactionOf({}, b), 'none')
})

test('옛 별칭 열쇠로 찾은 브랜드를 다시 누르면 새 이름으로 적고 옛 열쇠는 지운다', () => {
  const b = { name: '새이름', searchAliases: ['옛이름'] }
  const m = { 옛이름: 'like' }
  const next = setReaction(m, b, nextReaction(reactionOf(m, b), 'dislike'), fakeStorage())
  assert.deepEqual(next, { 새이름: 'dislike' })
})

test('like/dislike가 아닌 저장값은 none으로 읽는다', () => {
  assert.equal(reactionOf({ a: 'love' }, { name: 'a' }), 'none')
  assert.equal(reactionOf({ a: 1 }, { name: 'a' }), 'none')
})
