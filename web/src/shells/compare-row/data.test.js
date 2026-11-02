import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildRows, loadCompareRows, stampText } from './data.js'
import { applyFilters, defaultFilters } from '../../filters.js'
import { offerLink } from '../../offerLink.js'
import { PLATFORMS } from '../../platforms.js'

const o = (platform, amount, extra = {}) => ({ platform, amount, minOrderAmount: 20000, capturedAt: '2026-11-02T01:00:00Z', ...extra })
const brand = (name, offers, extra = {}) => ({ name, category: 'chicken', links: {}, offers, ...extra })

test('칸은 늘 PLATFORMS 순서 네 칸이고 오퍼가 없는 앱은 offer null', () => {
  const { rows } = buildRows([brand('가', [o('yogiyo', 6000), o('baemin', 7000)])])
  assert.deepEqual(rows[0].cells.map((c) => c.platform), PLATFORMS.map((p) => p.key))
  assert.equal(rows[0].cells[1].offer, null)
  assert.equal(rows[0].cells[2].offer, null)
})

test('한 앱에 확정과 랜덤이 같이 있으면 칸 오퍼는 확정', () => {
  const sure = o('baemin', 6000)
  const { rows } = buildRows([brand('가', [o('baemin', 9000, { certainty: 'random', qualifier: '랜덤' }), sure])])
  assert.equal(rows[0].cells[0].offer, sure)
  assert.equal(rows[0].cells[0].isTop, true)
})

test('동점 최고는 두 칸 다 isTop', () => {
  const { rows } = buildRows([brand('가', [o('baemin', 7000), o('yogiyo', 7000), o('ddangyo', 5000)])])
  assert.deepEqual(rows[0].cells.map((c) => c.isTop ?? false), [true, false, false, true])
})

test('확정이 없는 브랜드는 어느 칸도 isTop이 아니다', () => {
  const { rows } = buildRows([brand('가', [
    o('baemin', 9000, { certainty: 'random', qualifier: '랜덤' }),
    o('yogiyo', 8000, { certainty: 'menuOnly', qualifier: '특정메뉴' }),
  ])])
  assert.equal(rows[0].cells.some((c) => c.isTop), false)
})

test('자사 오퍼는 칸에 안 들어간다', () => {
  const { rows } = buildRows([brand('가', [o('own', 9000), o('baemin', 6000)])])
  assert.equal(rows[0].cells.some((c) => c.offer?.platform === 'own'), false)
})

test('쿠팡이츠 칸 href는 offerLink 결과와 같다', () => {
  const ce = o('coupangeats', 6000)
  const b = brand('가', [ce])
  const { rows } = buildRows([b])
  assert.equal(rows[0].cells[1].href, offerLink(ce, b.links, b.name))
})

test('최소주문을 모르면 min은 null(화면이 기존 라벨을 그린다)', () => {
  const { rows } = buildRows([brand('가', [o('baemin', 6000, { minOrderAmount: null })])])
  assert.equal(rows[0].cells[0].min, null)
})

test('확인 시각은 서울 시각 MM.dd HH:mm', () => {
  assert.equal(stampText('2026-11-02T15:30:00Z'), '11.03 00:30')
  assert.equal(stampText(null), null)
})

test('행 순서는 입력 순서와 상관없이 applyFilters 결과와 같다', () => {
  const list = [brand('가', [o('baemin', 6000)]), brand('나', [o('baemin', 9000)]), brand('다', [o('yogiyo', 7000)])]
  const want = applyFilters(list, defaultFilters()).map((b) => b.name)
  assert.deepEqual(buildRows(list).rows.map((r) => r.name), want)
  assert.deepEqual(buildRows([...list].reverse()).rows.map((r) => r.name), want)
})

test('전체 stamp는 행들 중 가장 최근', () => {
  const { stamp } = buildRows([
    brand('가', [o('baemin', 6000, { capturedAt: '2026-11-02T01:00:00Z' })]),
    brand('나', [o('baemin', 6000, { capturedAt: '2026-11-02T03:00:00Z' })]),
  ])
  assert.equal(stamp, '11.02 12:00')
})

test('배너가 실패해도 표를 그린다', async () => {
  const real = globalThis.fetch
  globalThis.fetch = async (url) => (String(url).endsWith('/api/brands')
    ? { ok: true, json: async () => [brand('가', [o('baemin', 6000)])] }
    : { ok: false, status: 500 })
  try {
    const { rows } = await loadCompareRows()
    assert.equal(rows.length, 1)
  } finally { globalThis.fetch = real }
})

test('어댑터에 정렬, 최대, 최소 계산이 없다', () => {
  const src = readFileSync(new URL('./data.js', import.meta.url), 'utf8')
  for (const banned of ['sort(', 'Math.max', 'Math.min']) assert.equal(src.includes(banned), false, banned)
})
