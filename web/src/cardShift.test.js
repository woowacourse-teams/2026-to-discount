import test from 'node:test'
import assert from 'node:assert/strict'
import { captureRects, shiftsBetween } from './cardShift.js'

const card = (key, left, top) => ({ key, rect: { left, top } })

test('빠진 카드 아래로 올라온 만큼을 잰다', () => {
  // BBQ가 빠지면 아래 둘이 한 칸(120px)씩 올라온다.
  const first = captureRects([card('BBQ', 16, 100), card('bhc', 16, 220), card('푸라닭', 16, 340)])
  const now = [card('bhc', 16, 100), card('푸라닭', 16, 220)]

  assert.deepEqual(shiftsBetween(first, now), [
    { key: 'bhc', dx: 0, dy: 120 },
    { key: '푸라닭', dx: 0, dy: 120 },
  ])
})

test('안 움직인 카드는 안 담는다', () => {
  // 빠진 카드보다 위에 있던 것은 그대로다. 전부 애니메이션하면 목록이 통째로 떤다.
  const first = captureRects([card('BBQ', 16, 100), card('bhc', 16, 220)])
  assert.deepEqual(shiftsBetween(first, [card('BBQ', 16, 100)]), [])
})

test('1px 미만 흔들림은 버린다', () => {
  // 스크롤바와 반올림으로 늘 조금씩 흔들린다.
  const first = captureRects([card('BBQ', 16, 100)])
  assert.deepEqual(shiftsBetween(first, [card('BBQ', 16.4, 100.6)]), [])
  assert.equal(shiftsBetween(first, [card('BBQ', 16, 104)]).length, 1)
})

test('처음 보는 카드는 되감을 옛 자리가 없다', () => {
  // 필터를 바꿔 새로 들어온 카드까지 밀면 엉뚱한 데서 날아온다.
  assert.deepEqual(shiftsBetween(captureRects([]), [card('BBQ', 16, 100)]), [])
})

test('가로로 움직인 것도 잰다', () => {
  // 넓은 화면에서는 격자가 두 칸이라 옆으로도 당겨온다.
  const first = captureRects([card('bhc', 200, 100)])
  assert.deepEqual(shiftsBetween(first, [card('bhc', 16, 100)]), [{ key: 'bhc', dx: 184, dy: 0 }])
})
