import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fetchMyReports, reportContext, REPORT_STATUSES, REPORT_TYPES, reportDate } from './report.js'

const LEDGER = new URL('../../api/src/main/java/com/discounttracker/analytics/ReportLedger.java', import.meta.url)
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

test('내 제보 상태 키가 API 목록과 같다', { skip: existsSync(LEDGER) ? false : 'ReportLedger.java 없음(API 이슈 대기)' }, () => {
  const java = readFileSync(LEDGER, 'utf8')
  const keys = [...java.match(/STATUSES = List\.of\(([^)]*)\)/)[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1])
  assert.deepEqual(keys.sort(), REPORT_STATUSES.map((s) => s.key).sort())
})

test('상태 넷은 라벨 셋(접수됨, 확인됨, 처리됨)으로 나온다', () => {
  assert.deepEqual([...new Set(REPORT_STATUSES.map((s) => s.label))], ['접수됨', '확인됨', '처리됨'])
})

test('reportDate는 서울 기준 yy-MM-dd', () => {
  assert.equal(reportDate('2026-11-03T16:00:00Z'), '26-11-04')
  assert.equal(reportDate('2026-11-03T14:59:59Z'), '26-11-03')
  assert.equal(reportDate('x'), '')
})

test('fetchMyReports: 헤더로만 보내고 주소에 visitorId가 없다', async () => {
  const calls = []
  const fake = async (url, init) => { calls.push([url, init]); return { ok: true, json: async () => ({ reports: [{ id: 'r_1' }] }) } }
  assert.deepEqual(await fetchMyReports('v_0123456789abcdef', 'http://a', fake), { ok: true, reports: [{ id: 'r_1' }] })
  assert.equal(calls[0][0], 'http://a/api/reports/mine')
  assert.equal(calls[0][1].headers['X-Visitor-Id'], 'v_0123456789abcdef')
  assert.ok(!calls[0][0].includes('v_'))
})

test('fetchMyReports: 실패는 ok:false, visitorId 없으면 요청하지 않는다', async () => {
  for (const status of [500, 429, 404]) assert.deepEqual(await fetchMyReports('v_x', '', async () => ({ ok: false, status })), { ok: false })
  assert.deepEqual(await fetchMyReports('v_x', '', async () => { throw new Error('net') }), { ok: false })
  assert.deepEqual(await fetchMyReports('v_x', '', async () => ({ ok: true, json: async () => ({}) })), { ok: false })
  let called = false
  assert.deepEqual(await fetchMyReports(null, '', async () => { called = true }), { ok: false })
  assert.equal(called, false)
})
