import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNewEnding } from './data.js'
import { offerLink } from '../../offerLink.js'

const NOW = new Date('2026-11-03T05:00:00Z') // 한국 11-03 14:00
const o = (extra) => ({ platform: 'baemin', amount: 5000, minOrderAmount: 15000, isNew: false, expiresAt: null, ...extra })
const b = (name, offers, extra = {}) => ({ name, offers, links: {}, ...extra })
const names = (cards) => cards.map((c) => c.brand.name)

test('새로 생김과 곧 끝남을 나누고 둘 다면 양쪽에 둔다', () => {
  const r = buildNewEnding([
    b('가', [o({ isNew: true })]),
    b('나', [o({ expiresAt: '2026-11-04' })]),
    b('다', [o({ isNew: true, expiresAt: '2026-11-05' })]),
  ], NOW)
  assert.deepEqual(names(r.fresh).sort(), ['가', '다'])
  assert.deepEqual(names(r.ending), ['나', '다'])
})

test('isNew 칸 없는 옛 응답은 firstSeenAt이 오늘(KST)이면 새로 생김', () => {
  const old = { platform: 'baemin', amount: 5000, firstSeenAt: '2026-11-02T16:00:00Z' }
  assert.equal(buildNewEnding([b('가', [old])], NOW).fresh.length, 1)
})

test('종료일이 없거나 깨지면 곧 끝남에도 withExpiry에도 없다', () => {
  const r = buildNewEnding([b('가', [null, '', '2026/11/05', 'abc'].map((e) => o({ expiresAt: e })))], NOW)
  assert.equal(r.ending.length, 0)
  assert.equal(r.counts.withExpiry, 0)
})

test('창 경계: 오늘과 +3일은 안, +4일과 어제는 밖', () => {
  const r = buildNewEnding([b('가', ['2026-11-03', '2026-11-06', '2026-11-07', '2026-11-02'].map((e) => o({ expiresAt: e })))], NOW)
  assert.deepEqual(r.ending.map((c) => c.offer.expiresAt), ['2026-11-03', '2026-11-06'])
  assert.deepEqual(r.ending.map((c) => c.endsLabel), ['오늘 끝', '~11.06'])
  assert.equal(r.counts.withExpiry, 4)
})

test('한국 날짜 경계: UTC 11-02 15:30은 한국 11-03', () => {
  const r = buildNewEnding([b('가', [o({ expiresAt: '2026-11-02' }), o({ expiresAt: '2026-11-03' })])], new Date('2026-11-02T15:30:00Z'))
  assert.deepEqual(r.ending.map((c) => c.endsLabel), ['오늘 끝'])
})

test('곧 끝남은 종료일 가까운 순, 같으면 브랜드 순서', () => {
  const r = buildNewEnding([
    b('가', [o({ amount: 9000, expiresAt: '2026-11-05' })]),
    b('나', [o({ amount: 3000, expiresAt: '2026-11-04' })]),
    b('다', [o({ amount: 7000, expiresAt: '2026-11-05' })]),
  ], NOW)
  assert.deepEqual(names(r.ending), ['나', '가', '다'])
  assert.equal(r.ending[0].endsLabel, '내일 끝')
})

test('품절은 두 줄에 없고 soldOut으로 센다', () => {
  const r = buildNewEnding([b('가', [o({ soldOut: true, isNew: true, expiresAt: '2026-11-03' })])], NOW)
  assert.equal(r.fresh.length + r.ending.length, 0)
  assert.equal(r.counts.soldOut, 1)
})

test('href는 offerLink를 그대로 쓴다', () => {
  const offer = o({ isNew: true, platform: 'yogiyo' })
  const brand = b('가', [offer], { links: { yogiyo: 'https://x.test/y' } })
  assert.equal(buildNewEnding([brand], NOW).fresh[0].href, offerLink(offer, brand.links, brand.name))
})

test('최소주문: 금액, 없음, 모름', () => {
  const min = (m) => buildNewEnding([b('가', [o({ isNew: true, minOrderAmount: m })])], NOW).fresh[0].min
  assert.equal(min(18900), '최소주문 18,900원↑')
  assert.equal(min(0), '최소주문 없음')
  assert.equal(min(null), '최소주문 미확인')
})

test('lastChecked는 capturedAt 최댓값, 없으면 null', () => {
  assert.equal(buildNewEnding([b('가', [o({ capturedAt: '2026-11-03T01:00:00Z' }), o({ capturedAt: '2026-11-03T04:00:00Z' })])], NOW).lastChecked, '2026-11-03T04:00:00Z')
  assert.equal(buildNewEnding([b('가', [o()])], NOW).lastChecked, null)
})

test('빈 입력', () => {
  const r = buildNewEnding([], NOW)
  assert.equal(r.counts.offers, 0)
  assert.equal(r.fresh.length + r.ending.length, 0)
})
