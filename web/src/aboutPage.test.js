import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// /about은 정적 HTML이라 빌드가 잡아 주지 않는다. Google Sites 임베드와 서비스 링크의 약속을 지킨다.
const html = readFileSync(fileURLToPath(new URL('../public/about/index.html', import.meta.url)), 'utf8')

test('서비스로 가는 링크는 모두 B 홈(home=b)이다', () => {
  const hrefs = [...html.matchAll(/<a [^>]*href="(\/[^"#]*)"/g)].map((m) => m[1]).filter((h) => !h.startsWith('/privacy'))
  assert.ok(hrefs.length >= 3, '브랜드, 첫 장, 마지막 장 링크가 있어야 한다')
  for (const h of hrefs) assert.equal(h, '/?home=b', `서비스 링크가 home=b가 아니다: ${h}`)
})

test('?s=1~6 한 장 모드와 m=hide 판정이 있다', () => {
  assert.match(html, /\[\?&\]s=\[1-6\]/)
  assert.match(html, /\[\?&\]m=hide/)
  assert.match(html, /\.solo-hide body \{ display: none; \}/)
})

test('임베드 안에서는 링크를 새 탭으로 연다(샌드박스는 _top 이동을 막는다)', () => {
  assert.match(html, /self !== top/)
  assert.match(html, /a\.target = '_blank'/)
  assert.doesNotMatch(html, /a\.target = '_top'/)
})

test('장은 6개이고 id가 s1~s6이다', () => {
  const ids = [...html.matchAll(/<section class="slide[^"]*" id="(s\d+)"/g)].map((m) => m[1])
  assert.deepEqual(ids, ['s1', 's2', 's3', 's4', 's5', 's6'])
})
