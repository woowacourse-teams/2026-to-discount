import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callouts, chartModel, GUTTER, niceDomain, nearestIndex, linePaths, summary, PILL_W } from './historyChart.js'

const P = (date, amount, line = 'solid') => ({ date, amount, line })

test('niceDomain: floor below min, ceil at/above max, never collapses', () => {
  assert.deepEqual(niceDomain(7500, 10000), [7000, 10000])
  assert.deepEqual(niceDomain(7000, 9200), [6000, 10000])
  assert.deepEqual(niceDomain(500, 500), [0, 1000])
  assert.deepEqual(niceDomain(3000, 3000), [2000, 3000])
})

test('summary uses solid points only', () => {
  const s = summary([P('2026-09-23', 10000), P('2026-09-24', 7500), P('2026-09-25', 9200),
    P('2026-09-26', 2000, 'carried'), P('2026-09-27', null, 'break')])
  assert.deepEqual(s, { max: 10000, maxDate: '2026-09-23', min: 7500, avg: 8900 })
  assert.equal(summary([P('d', null, 'break')]), null)
})

test('linePaths: straight segments point to point; solid gets area', () => {
  const r = linePaths([{ x: 0, y: 10, line: 'solid' }, { x: 5, y: 20, line: 'solid' }, { x: 9, y: 15, line: 'solid' }], 50)
  assert.deepEqual(r.solid, ['M0 10 L5 20 L9 15'])
  assert.deepEqual(r.area, ['M0 10 L5 20 L9 15 V50 H0 Z'])
  assert.deepEqual(r.carried, [])
})

test('linePaths: carried segments dashed, break leaves gap', () => {
  const r = linePaths([{ x: 0, y: 1, line: 'solid' }, { x: 1, y: 1, line: 'solid' }, { x: 2, y: 2, line: 'carried' },
    { x: 3, y: 3, line: 'solid' }, { x: 4, y: null, line: 'break' }, { x: 5, y: 4, line: 'solid' }, { x: 6, y: 4, line: 'solid' }], 9)
  assert.deepEqual(r.solid, ['M0 1 L1 1', 'M5 4 L6 4'])
  assert.deepEqual(r.carried, ['M1 1 L2 2 L3 3'])
  assert.equal(r.area.length, 2)
})

test('chartModel: fewer than two drawable points draws nothing', () => {
  assert.equal(chartModel([P('2026-10-05', 5000)]), null)
  assert.equal(chartModel([P('2026-10-05', 5000), P('2026-10-06', null, 'break')]), null)
})

test('chartModel: domain bounds map to gridline y, first x at gutter', () => {
  const m = chartModel([P('2026-10-01', 7000), P('2026-10-11', 10000)])
  assert.equal(m.lo, 6000)
  assert.equal(m.hi, 10000)
  assert.equal(m.xy[1].y, m.yHi)
  assert.equal(m.xy[0].x, GUTTER)
  assert.ok(m.xy[0].y < m.yLo)
})

test('nearestIndex picks closest x', () => {
  assert.equal(nearestIndex(60, [0, 50, 100]), 1)
  assert.equal(nearestIndex(-9, [0, 50, 100]), 0)
})

test('callouts: max and current; collision keeps current; same point once', () => {
  const pts = [P('a', 9000), P('b', 7000), P('c', 8000), P('d', null, 'break')]
  const far = callouts(pts, [{ x: 40, y: 40 }, { x: 150, y: 100 }, { x: 300, y: 70 }, { x: 310, y: null }])
  assert.deepEqual(far.map((c) => c.i), [0, 2])
  assert.equal(far[0].cx, GUTTER + PILL_W / 2) // 가장자리 안쪽으로
  const near = callouts(pts, [{ x: 280, y: 60 }, { x: 290, y: 100 }, { x: 300, y: 70 }, { x: 310, y: null }])
  assert.deepEqual(near.map((c) => c.i), [2])
  assert.deepEqual(callouts([P('a', 1), P('b', 5)], [{ x: 40, y: 50 }, { x: 300, y: 10 }]).map((c) => c.i), [1])
  assert.equal(callouts([P('a', 1), P('b', 5)], [{ x: 40, y: 50 }, { x: 300, y: 10 }])[0].top, 16) // 위에 자리 없으면 아래
})
