import test from 'node:test'
import assert from 'node:assert/strict'
import {
  NEVER, WHEN_BIGGER, applyHidden, hideBrand, isHidden, readHidden, revivedNames,
  setRule, showBrand,
} from './hiddenBrands.js'

/** localStorage 흉내. 실제 브라우저 저장소 없이 돌린다. */
function fakeStorage(initial = null) {
  let value = initial
  return {
    getItem: () => value,
    setItem: (_, v) => { value = v },
    get raw() { return value },
  }
}

/** 저장이 막힌 브라우저(사생활 보호 창). 읽기도 쓰기도 던진다. */
const blocked = {
  getItem() { throw new Error('denied') },
  setItem() { throw new Error('denied') },
}

test('숨기고 되살린다', () => {
  const s = fakeStorage()
  let hidden = hideBrand({}, 'BBQ', { amount: 5000, rule: NEVER, now: 1 }, s)
  assert.deepEqual(Object.keys(hidden), ['BBQ'])
  assert.equal(isHidden(hidden, 'BBQ', 5000), true)

  hidden = showBrand(hidden, 'BBQ', s)
  assert.deepEqual(hidden, {})
  assert.equal(isHidden(hidden, 'BBQ', 5000), false)
})

test('할인이 커지면 다시 보여 주는 규칙', () => {
  const s = fakeStorage()
  const hidden = hideBrand({}, 'BBQ', { amount: 5000, rule: WHEN_BIGGER, now: 1 }, s)

  assert.equal(isHidden(hidden, 'BBQ', 5000), true, '같으면 아직 숨긴다')
  assert.equal(isHidden(hidden, 'BBQ', 4000), true, '작아져도 숨긴다')
  assert.equal(isHidden(hidden, 'BBQ', 6000), false, '커지면 다시 보인다')
})

test('숨길 때 금액을 몰랐으면 계속 숨긴다', () => {
  // 견줄 값이 없는데 "커졌다"고 할 수 없다.
  const hidden = { BBQ: { at: 1, amount: null, rule: WHEN_BIGGER } }
  assert.equal(isHidden(hidden, 'BBQ', 9000), true)
  assert.equal(isHidden(hidden, 'BBQ', null), true)
})

test('규칙만 바꾸면 숨긴 시점의 금액은 그대로다', () => {
  const s = fakeStorage()
  let hidden = hideBrand({}, 'BBQ', { amount: 5000, rule: NEVER, now: 7 }, s)
  hidden = setRule(hidden, 'BBQ', WHEN_BIGGER, s)
  assert.deepEqual(hidden.BBQ, { at: 7, amount: 5000, rule: WHEN_BIGGER })
  assert.equal(setRule(hidden, '없는브랜드', NEVER, s).BBQ.rule, WHEN_BIGGER)
})

test('목록에서 걷어내고, 되살아난 이름을 알려준다', () => {
  const brands = [{ name: 'BBQ' }, { name: 'bhc' }, { name: '푸라닭' }]
  const amount = { BBQ: 6000, bhc: 3000, 푸라닭: 7000 }
  const amountOf = (b) => amount[b.name]
  const hidden = {
    BBQ: { at: 1, amount: 5000, rule: WHEN_BIGGER },   // 커졌다 - 다시 보인다
    bhc: { at: 1, amount: 5000, rule: WHEN_BIGGER },   // 작아졌다 - 숨긴 채로
    푸라닭: { at: 1, amount: 5000, rule: NEVER },        // 영영 숨긴다
  }

  assert.deepEqual(applyHidden(brands, hidden, amountOf).map((b) => b.name), ['BBQ'])
  assert.deepEqual(revivedNames(brands, hidden, amountOf), ['BBQ'])
})

test('아무것도 안 숨겼으면 같은 배열을 그대로 돌려준다', () => {
  // 매번 새 배열을 만들면 React가 목록을 다시 그린다.
  const brands = [{ name: 'BBQ' }]
  assert.equal(applyHidden(brands, {}, () => 5000), brands)
})

test('저장소가 막혀도 화면은 돈다', () => {
  assert.deepEqual(readHidden(blocked), {})
  // 쓰기가 던져도 그 방문 동안 쓸 상태는 돌려준다.
  assert.deepEqual(hideBrand({}, 'BBQ', { amount: 1, now: 5 }, blocked),
    { BBQ: { at: 5, amount: 1, rule: NEVER } })
})

test('깨진 값은 빈 목록으로 읽는다', () => {
  assert.deepEqual(readHidden(fakeStorage('{망가진')), {})
  assert.deepEqual(readHidden(fakeStorage('[1,2]')), {}, '배열은 우리 모양이 아니다')
  assert.deepEqual(readHidden(fakeStorage(null)), {})
})
