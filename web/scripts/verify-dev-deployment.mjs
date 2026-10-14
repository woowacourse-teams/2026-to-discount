import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEVELOPMENT_API } from '../src/apiBase.js'
const timeout = () => AbortSignal.timeout(20000)
const url = new URL(process.env.DEPLOYMENT_URL)
assert.equal(url.protocol, 'https:')
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const headers = bypass ? { 'x-vercel-protection-bypass': bypass } : {}
if (process.env.VERCEL_TOKEN && !bypass) {
  // 고유 배포 URL은 기본 주소와 달리 보호될 수 있다. 기존 배포 권한으로 읽는다.
  const dir = mkdtempSync(join(tmpdir(), 'web-dev-smoke-'))
  try {
    const run = spawnSync('vercel', ['curl', '/', '--deployment', url.href, '--', '--silent', '--show-error',
      '--max-time', '20', '--dump-header', join(dir, 'headers'), '--output', join(dir, 'body'),
      '--write-out', '%{http_code}'], {
      cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 60000,
    })
    if (run.status !== 0) throw new Error('인증된 후보 배포 요청 실패: ' + run.stderr)
    assert.match(run.stdout.trim(), /200$/, '고유 배포 URL이 보호되어 있으면 VERCEL_DEV_AUTOMATION_BYPASS_SECRET 등록이 필요합니다')
    assert.match(readFileSync(join(dir, 'headers'), 'utf8'), /^x-ssr:\s*1\s*$/im, 'SSR이 대체 화면으로 내려갔다')
    assert.ok(readFileSync(join(dir, 'body'), 'utf8').includes('window.__SSR__='), 'SSR 데이터가 없다')
  } finally { rmSync(dir, { recursive: true, force: true }) }
} else {
  const page = await fetch(url, { headers, signal: timeout(), redirect: 'manual' })
  assert.equal(page.status, 200, '후보 URL이 보호되어 있으면 Vercel 배포 토큰 또는 우회 시크릿이 필요합니다')
  assert.equal(page.headers.get('x-ssr'), '1', 'SSR이 대체 화면으로 내려갔다')
  assert.ok((await page.text()).includes('window.__SSR__='), 'SSR 데이터가 없다')
}
const origin = 'https://to-discount-dev.vercel.app'
for (const path of ['/api/brands', '/api/banners']) {
  const response = await fetch(DEVELOPMENT_API + path, { headers: { Origin: origin }, signal: timeout() })
  assert.equal(response.status, 200, `${path} 개발 API 응답 실패`)
  assert.equal(response.headers.get('access-control-allow-origin'), origin, `${path} CORS 허용 누락`)
  assert.ok(Array.isArray(await response.json()), `${path} 응답 계약 불일치`)
}
console.log('development deployment: PASS')
