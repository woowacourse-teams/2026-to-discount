import test from 'node:test'
import assert from 'node:assert/strict'
import { bannerTag } from './bannerTag.js'

// amountSpec은 api Banner.amountSpec(BannerAmount 레코드)이 그대로 온 모양이다 -
// wonMin/wonMax/percent/random/kind. brief 초안은 옛 yaml 표기(won/[lo,hi])를 그대로
// 썼는데 실제 응답 칸 이름과 안 맞아 고쳤다(task-18-report.md 참고).
test('표식은 칸에서 나온다 - 문구를 되짚지 않는다', () => {
  assert.deepEqual(bannerTag({ firstCome: 'issue' }), { kind: 'first-come', label: '선착순' })
  assert.deepEqual(bannerTag({ targeted: true }), { kind: 'targeted', label: '타겟' })
  assert.deepEqual(bannerTag({ amountSpec: { wonMin: 1000, wonMax: 8000, random: true } }),
    { kind: 'random', label: '랜덤' })
})

test('캐시백과 적립은 문구가 다르다 - 쓸 수 있는 곳이 다르다', () => {
  assert.deepEqual(bannerTag({ amountSpec: { percent: 50, kind: 'cashback' } }),
    { kind: 'cashback', label: '캐시백' })
  assert.deepEqual(bannerTag({ amountSpec: { percent: 5, kind: 'points' } }),
    { kind: 'cashback', label: '적립' })
})

test('할인 배너에는 표식이 없다', () => {
  assert.equal(bannerTag({ amountSpec: { wonMin: 8000, wonMax: 8000, kind: 'discount' } }), null)
  assert.equal(bannerTag({}), null)
})

test('정률 할인은 표식이 없다 - 금액 자리에 이미 뜬다', () => {
  assert.equal(bannerTag({ amountSpec: { percent: 30, kind: 'discount' } }), null)
})

test('선착순이 랜덤보다 먼저다 - 뽑기 선착순은 선착순으로 읽힌다', () => {
  assert.deepEqual(bannerTag({ firstCome: 'use', amountSpec: { wonMax: 7000, random: true } }),
    { kind: 'first-come', label: '선착순' })
})
