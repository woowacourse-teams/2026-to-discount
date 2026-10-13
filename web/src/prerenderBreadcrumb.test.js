// 브랜드 정적 페이지에 홈 → 브랜드 BreadcrumbList(JSON-LD)가 실리고, 자기 canonical을 가리키는지 본다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brandPage } from '../scripts/prerender.mjs'

test('브랜드 페이지에 파싱되는 BreadcrumbList가 있다', () => {
  const b = { name: '교촌치킨', category: 'chicken', offers: [{ platform: 'baemin', amount: 3000 }] }
  const html = brandPage(b, [], '2026-10-14', '')
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1]
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
  const crumb = blocks.find((d) => d['@type'] === 'BreadcrumbList')
  assert.ok(crumb, 'BreadcrumbList가 없다')
  assert.deepEqual(crumb.itemListElement.map((i) => [i.position, i.name]), [[1, '홈'], [2, '교촌치킨']])
  assert.equal(crumb.itemListElement[1].item, canonical)
})
