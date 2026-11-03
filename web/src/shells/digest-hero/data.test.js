import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDigestHero, capturedLabel } from './data.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

const offer = (o) => ({ platform: 'baemin', amount: 8000, minOrderAmount: 20000, certainty: 'exact', kind: 'discount', soldOut: false, isNew: false, capturedAt: '2026-11-03T01:05:00Z', ...o })
const brand = (name, offers, extra = {}) => ({ name, category: '치킨', offers, ...extra })

const FIXTURE = [
  brand('가', [offer({ amount: 6000 })]),
  brand('나', [offer({ amount: 12000, platform: 'yogiyo' }), offer({ amount: 9000 })]),
  brand('다', [offer({ amount: 7000, platform: 'ddangyo' })]),
]

test('요약의 최고 금액과 큰 카드 금액이 같다', () => {
  const { summary, hero } = buildDigestHero(FIXTURE)
  assert.equal(summary.best, 12000)
  assert.equal(hero.main.amount, '12,000원')
  assert.equal(summary.count, 3)
})

test('금액이 낮은 신규 브랜드가 큰 카드를 가로채지 않는다', () => {
  const brands = [
    brand('신규', [offer({ amount: 5000, isNew: true })]),
    brand('기존', [offer({ amount: 15000 })]),
  ]
  const { hero, summary } = buildDigestHero(brands)
  assert.equal(hero.name, '기존')
  assert.equal(summary.fresh, 1)
})

test('앱에 오퍼가 없음과 금액을 모름은 다른 상태다', () => {
  const brands = [brand('가', [offer({ amount: 9000 }), offer({ platform: 'coupangeats', amount: null, certainty: 'capped', rawText: null })])]
  const { hero } = buildDigestHero(brands)
  const by = Object.fromEntries(hero.apps.map((a) => [a.key, a]))
  assert.equal(by.yogiyo.state, 'none')
  assert.equal(by.coupangeats.state, 'unknown')
  assert.equal(by.baemin.state, 'ok')
  assert.notEqual(by.yogiyo.state, by.coupangeats.state)
})

test('최소주문 null은 미확인, 0은 없음', () => {
  assert.equal(buildDigestHero([brand('가', [offer({ minOrderAmount: null })])]).hero.main.minText, '최소주문 미확인')
  assert.equal(buildDigestHero([brand('가', [offer({ minOrderAmount: 0 })])]).hero.main.minText, '최소주문 없음')
})

test('빈 입력은 던지지 않는다', () => {
  for (const input of [[], null, undefined]) {
    assert.deepEqual(buildDigestHero(input), { summary: null, hero: null, rows: [] })
  }
})

test('링크는 offerLink 결과 그대로다', () => {
  const o = offer({ link: 'https://example.com/deal?x=1' })
  const b = brand('가', [o], { links: {} })
  assert.equal(buildDigestHero([b]).hero.main.href, offerLink(o, b.links, b.name))
  assert.equal(buildDigestHero([b]).hero.main.href, 'https://example.com/deal?x=1')
})

test('앱 칸 순서는 PLATFORMS와 같다', () => {
  const { hero } = buildDigestHero(FIXTURE)
  assert.deepEqual(hero.apps.map((a) => a.key), PLATFORMS.map((p) => p.key))
})

test('시각은 한국 시각 HH:mm, null이면 빈 값', () => {
  assert.equal(capturedLabel('2026-11-03T01:05:00Z'), '10:05')
  assert.equal(capturedLabel('2026-11-03T01:05:00Z', '2026-11-03'), '10:05')
  assert.equal(capturedLabel('2026-11-03T01:05:00Z', '2026-11-04'), '11/3 10:05')
  assert.equal(capturedLabel(null), '')
  assert.equal(buildDigestHero(FIXTURE).hero.capturedAt, '2026-11-03T01:05:00Z')
})
