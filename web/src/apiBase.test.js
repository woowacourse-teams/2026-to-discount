import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveApiBase, PRODUCTION_API, DEVELOPMENT_API } from './apiBase.js'

test('운영 기본값을 유지하며 명시한 API origin을 정규화한다', () => {
  assert.equal(resolveApiBase(), PRODUCTION_API)
  assert.throws(() => resolveApiBase(undefined, 'develoment'))
  assert.equal(resolveApiBase(DEVELOPMENT_API + '/', 'development'), DEVELOPMENT_API)
  assert.equal(resolveApiBase('http://localhost:8080'), 'http://localhost:8080')
})
test('개발 배포는 누락되거나 운영으로 향하는 설정을 거부한다', () => {
  for (const value of [undefined, '', PRODUCTION_API, 'https://other.example']) {
    assert.throws(() => resolveApiBase(value, 'development'))
  }
})
test('상대경로, 인증정보, 경로와 쿼리를 API origin으로 허용하지 않는다', () => {
  for (const value of ['/api', 'ftp://example.com', 'https://u:p@example.com', 'https://example.com/api', 'https://example.com/?secret=x']) {
    assert.throws(() => resolveApiBase(value))
  }
})
