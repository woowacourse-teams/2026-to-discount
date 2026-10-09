import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chartModel, GUTTER, inflections, labelLayout, nearestIndex } from './historyChart.js'

const P = (date, amount, line, reason) => ({ date, amount, line, reason })

test('solid and carried runs become separate polylines', () => {
  const m = chartModel([P('2026-10-05', 5000, 'solid'), P('2026-10-06', 5000, 'carried', 'stage_suspect'),
    P('2026-10-07', 6000, 'solid')], 300, 100)
  assert.equal(m.solid.length, 0)        // 실선 점이 따로따로 하나씩이라 실선 구간은 없고, 사이는 점선뿐
  assert.equal(m.carried.length, 2)       // 05-06, 06-07 두 구간
  assert.equal(m.yMax, 6000)
})

test('break ends the line', () => {
  const m = chartModel([P('2026-10-05', 5000, 'solid'), P('2026-10-06', 5000, 'solid'),
    P('2026-10-07', null, 'break'), P('2026-10-08', 4000, 'solid')], 300, 100)
  assert.equal(m.solid.length, 1)       // 08은 한 점짜리 구간이라 선이 없다
  assert.equal(m.pts[2].y, null)        // 끊김은 y 없음
})

test('fewer than two drawable points draws nothing', () => {
  assert.equal(chartModel([P('2026-10-05', 5000, 'solid')], 300, 100), null)
  assert.equal(chartModel([], 300, 100), null)
})

test('x spreads by date, y grows upward', () => {
  const m = chartModel([P('2026-10-01', 0, 'solid'), P('2026-10-11', 1000, 'solid')], 100, 50)
  assert.equal(m.pts[0].x < m.pts[1].x, true)
  assert.equal(m.pts[0].y > m.pts[1].y, true)
})

test('inflections: changes, first, last, after break', () => {
  const pts = [P('d1', 5, 'solid'), P('d2', 5, 'solid'), P('d3', 7, 'solid'), P('d4', 7, 'solid'),
    P('d5', null, 'break'), P('d6', 7, 'solid'), P('d7', 7, 'solid')]
  assert.deepEqual(inflections(pts), [0, 2, 5, 6])
})

test('labelLayout keeps the later of two colliding labels, clamps edges', () => {
  const r = labelLayout([{ i: 0, x: 2, y: 50 }, { i: 1, x: 20, y: 50 }, { i: 2, x: 100, y: 5 }, { i: 3, x: 299, y: 50 }], 300)
  assert.deepEqual(r.map((l) => l.i), [1, 2, 3])
  assert.equal(r[0].lx, 20)
  assert.equal(r[1].below, true)
  assert.equal(r[2].lx, 280)
})

test('nearestIndex picks closest x', () => {
  assert.equal(nearestIndex(60, [0, 50, 100]), 1)
  assert.equal(nearestIndex(-9, [0, 50, 100]), 0)
})

test('axis labels share the line coordinates: yMax and 0 map to yTop and yZero', () => {
  const m = chartModel([P('2026-10-01', 0, 'solid'), P('2026-10-11', 1000, 'solid')], 300, 120)
  assert.equal(m.pts[1].y, m.yTop)
  assert.equal(m.pts[0].y, m.yZero)
  assert.equal(m.pts[0].x, GUTTER)
})
