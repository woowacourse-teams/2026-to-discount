import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reportContext, REPORT_TYPES } from './report.js'
import { PLATFORMS } from './platforms.js'

test('제보 종류와 앱 키가 API 허용 목록과 같다', () => {
  const java = readFileSync(new URL('../../api/src/main/java/com/discounttracker/analytics/ReportController.java', import.meta.url), 'utf8')
  const types = java.match(/TYPES = Map\.of\(([\s\S]*?)\);/)[1]
  const typeKeys = [...types.matchAll(/"([a-z]+)"/g)].map((m) => m[1])
  assert.deepEqual(typeKeys.sort(), REPORT_TYPES.map((t) => t.key).sort())
  const plats = [...java.match(/PLATFORMS = java\.util\.Set\.of\(([^)]*)\)/)[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1])
  assert.deepEqual(plats.sort(), PLATFORMS.map((p) => p.key).sort())
})

test('제보 맥락에 주소와 고른 필터를 싣는다', () => {
  const ctx = reportContext('https://x/?a=1', {
    search: 'BBQ', categories: new Set(['chicken']), platforms: new Set(['baemin', 'coupang']), updatedOnly: false, includeRandom: true,
  })
  assert.equal(ctx.url, 'https://x/?a=1')
  assert.equal(ctx.filters, 'search=BBQ categories=chicken platforms=baemin,coupang includeRandom=true')
})

test('필터가 없으면 주소만, 길이는 500자까지', () => {
  assert.deepEqual(reportContext('https://x/', null), { url: 'https://x/', filters: '' })
  assert.equal(reportContext('u', { search: 'a'.repeat(900) }).filters.length, 500)
})
