import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 보안 헤더 약속: 모든 경로에 기본 헤더를 달고, 프레임 차단은 /about만 뺀다(Google Sites 임베드).
const { headers } = JSON.parse(readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8'))
const valueOf = (source, key) => headers.find((h) => h.source === source)?.headers.find((x) => x.key === key)?.value

test('모든 경로에 nosniff, Referrer-Policy, Permissions-Policy를 단다', () => {
  assert.equal(valueOf('/(.*)', 'X-Content-Type-Options'), 'nosniff')
  assert.equal(valueOf('/(.*)', 'Referrer-Policy'), 'strict-origin-when-cross-origin')
  assert.match(valueOf('/(.*)', 'Permissions-Policy'), /camera=\(\).*microphone=\(\).*geolocation=\(\)/)
})

test('X-Frame-Options는 /about을 뺀 경로에만 건다', () => {
  const rule = headers.find((h) => h.headers.some((x) => x.key === 'X-Frame-Options'))
  assert.ok(rule, 'X-Frame-Options 규칙이 있어야 한다')
  assert.equal(rule.headers.find((x) => x.key === 'X-Frame-Options').value, 'SAMEORIGIN')
  // Vercel source는 path-to-regexp 문법이라 앞에 /를 붙여 JS 정규식으로 옮겨 본다.
  const re = new RegExp('^' + rule.source + '$')
  assert.ok(re.test('/'), '홈은 프레임을 막는다')
  assert.ok(re.test('/privacy'), '/privacy는 프레임을 막는다')
  assert.ok(!re.test('/about'), '/about은 임베드를 허용한다')
  assert.ok(!re.test('/about/'), '/about/도 임베드를 허용한다')
})
