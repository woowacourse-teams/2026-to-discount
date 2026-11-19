import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableMetrics, metricPoints, plotLines, rangeStats, shareRows, sliceByRange, toPoint, trendPoints } from './insightModel.js'

const D = (date, baemin, carriedShare = 0) => ({ date, median: { baemin }, carriedShare: { baemin: carriedShare } })

test('이어 쓴 값은 점선, null은 끊김, 0은 0으로 그린다', () => {
  assert.deepEqual(toPoint('d', { amount: 3000, carried: true }), { date: 'd', amount: 3000, line: 'carried' })
  assert.deepEqual(toPoint('d', null), { date: 'd', amount: null, line: 'break' })
  assert.deepEqual(toPoint('d', { amount: 0, carried: false }), { date: 'd', amount: 0, line: 'solid' })

  // 전부 이어 쓴 날(carriedShare 1)만 점선, 일부 이어 쓴 날은 실선
  const pts = trendPoints([D('2026-09-01', 4000), D('2026-09-02', 4000, 1), D('2026-09-03', 3000, 0.5),
    D('2026-09-04', null), D('2026-09-05', 0), D('2026-09-06', 0)], 'baemin')
  assert.deepEqual(pts.map((p) => p.line), ['solid', 'carried', 'solid', 'break', 'solid', 'solid'])

  const m = plotLines([{ key: 'baemin', points: pts }])
  const { xy, solid, carried } = m.lines[0]
  assert.equal(xy[3].y, null, 'null은 0 자리에 찍지 않는다')
  assert.equal(m.lo, 0)
  assert.equal(xy[4].y, m.yLo, '실제 0은 0 높이에 찍는다')
  assert.equal(carried.length, 1, '이어 쓴 점에 닿는 구간은 점선 하나로 묶인다')
  assert.equal(solid.length, 1, '끊김 뒤 0~0 구간만 실선')
  assert.ok(!solid[0].includes(`${xy[3].x} `), '끊긴 날을 지나가는 선이 없다')
})

test('지수는 기준일 첫 값을 100으로, 기준값이 없으면 그리지 않는다', () => {
  const pts = trendPoints([D('2026-08-31', 2000), D('2026-09-01', 4000), D('2026-09-02', 5000)], 'baemin', 'index')
  assert.deepEqual(pts.map((p) => p.amount), [50, 100, 125])
  assert.ok(trendPoints([D('2026-09-01', null)], 'baemin', 'index').every((p) => p.amount == null))
})

test('비율은 분모 30 미만이거나 null이면 그리지 않는다', () => {
  assert.equal(shareRows({ n: 29, share: { baemin: 0.5 } }), null)
  assert.equal(shareRows(null), null)
  assert.equal(shareRows({ n: 100, share: { baemin: null, yogiyo: null } }), null)
  assert.deepEqual(shareRows({ n: 30, share: { baemin: 0.3, coupangeats: 0.4, yogiyo: null } }),
    [{ app: 'coupangeats', share: 0.4 }, { app: 'baemin', share: 0.3 }])
})

test('조회 기간은 마지막 날부터 거꾸로 센다', () => {
  const days = ['2026-11-01', '2026-11-10', '2026-11-19'].map((date) => ({ date }))
  assert.deepEqual(sliceByRange(days, '2w').map((d) => d.date), ['2026-11-10', '2026-11-19'])
  assert.equal(sliceByRange(days, 'all').length, 3)
})

test('지표는 응답에 있는 칸만 고르고, 기간 요약은 최고와 변화를 낸다', () => {
  const days = [{ date: 'a', active: { baemin: 3 } }, { date: 'b', active: { baemin: 9 } }, { date: 'c', active: { baemin: 5 } }]
  assert.deepEqual(availableMetrics(days).map((m) => m.key), ['active'])
  const s = rangeStats(metricPoints(days, 'baemin', 'active'))
  assert.deepEqual(s, { last: 5, lastDate: 'c', avg: 6, max: 9, maxDate: 'b', delta: 2 })
  assert.equal(rangeStats(metricPoints(days, 'yogiyo', 'active')), null)
})
