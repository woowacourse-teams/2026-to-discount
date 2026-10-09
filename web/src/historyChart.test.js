import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chartModel } from './historyChart.js'

const P = (date, amount, line, reason) => ({ date, amount, line, reason })

test('solid and carried runs become separate polylines', () => {
  const m = chartModel([P('2026-10-05', 5000, 'solid'), P('2026-10-06', 5000, 'carried', 'stage_suspect'),
    P('2026-10-07', 6000, 'solid')], 300, 100)
  assert.equal(m.solid.length, 0)        // 실선 점이 따로따로 하나씩이라 실선 구간은 없고, 사이는 점선뿐
  assert.equal(m.carried.length, 2)       // 05-06, 06-07 두 구간
  assert.deepEqual(m.dots.map((d) => d.hollow), [false, true, false])
  assert.equal(m.dots[1].reason, 'stage_suspect')
  assert.equal(m.yMax, 6000)
})

test('break ends the line', () => {
  const m = chartModel([P('2026-10-05', 5000, 'solid'), P('2026-10-06', 5000, 'solid'),
    P('2026-10-07', null, 'break'), P('2026-10-08', 4000, 'solid')], 300, 100)
  assert.equal(m.solid.length, 1)       // 08은 한 점짜리 구간이라 선 없이 점만
  assert.equal(m.dots.length, 3)
})

test('fewer than two drawable points draws nothing', () => {
  assert.equal(chartModel([P('2026-10-05', 5000, 'solid')], 300, 100), null)
  assert.equal(chartModel([], 300, 100), null)
})

test('x spreads by date, y grows upward', () => {
  const m = chartModel([P('2026-10-01', 0, 'solid'), P('2026-10-11', 1000, 'solid')], 100, 50)
  assert.equal(m.dots[0].x < m.dots[1].x, true)
  assert.equal(m.dots[0].y > m.dots[1].y, true)
})
