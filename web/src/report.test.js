import test from 'node:test'
import assert from 'node:assert/strict'
import { reportContext } from './report.js'

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
