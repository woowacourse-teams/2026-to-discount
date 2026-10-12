import assert from 'node:assert/strict'
import { DEVELOPMENT_API } from '../src/apiBase.js'
const timeout = () => AbortSignal.timeout(20000)
const url = new URL(process.env.DEPLOYMENT_URL)
assert.equal(url.protocol, 'https:')
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const headers = bypass ? { 'x-vercel-protection-bypass': bypass } : {}
const page = await fetch(url, { headers, signal: timeout() })
assert.equal(page.status, 200, 'SSR 응답 실패')
assert.equal(page.headers.get('x-ssr'), '1', 'SSR이 대체 화면으로 내려갔다')
assert.ok((await page.text()).includes('window.__SSR__='), 'SSR 데이터가 없다')
const origin = 'https://to-discount-dev.vercel.app'
for (const path of ['/api/brands', '/api/banners']) {
  const response = await fetch(DEVELOPMENT_API + path, { headers: { Origin: origin }, signal: timeout() })
  assert.equal(response.status, 200, `${path} 개발 API 응답 실패`)
  assert.equal(response.headers.get('access-control-allow-origin'), origin, `${path} CORS 허용 누락`)
  assert.ok(Array.isArray(await response.json()), `${path} 응답 계약 불일치`)
}
console.log('development deployment: PASS')
