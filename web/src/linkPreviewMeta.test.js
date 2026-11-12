import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 링크 미리보기(og, twitter) 이미지가 실제 파일과 어긋나지 않게 지킨다.
// 2026-11-12 배너를 16:9로 바꾸며 메타 높이를 같이 안 바꾸면 메신저가 이미지를 잘못 자른다.
const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(root + p, 'utf8')
const png = readFileSync(root + 'public/og-image.png')
const size = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }

test('og-image.png는 PNG이고 1200x630이다', () => {
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.deepEqual(size, { w: 1200, h: 630 })
})

for (const [name, src] of [['prerender.mjs', 'scripts/prerender.mjs'], ['/about', 'public/about/index.html'], ['/privacy', 'public/privacy/index.html']]) {
  test(`${name}: og:image 크기 메타가 실제 파일과 같다`, () => {
    const t = read(src)
    const w = [...t.matchAll(/og:image:width" content="(\d+)"/g)].map((m) => +m[1])
    const h = [...t.matchAll(/og:image:height" content="(\d+)"/g)].map((m) => +m[1])
    assert.ok(w.length && h.length, 'og:image:width/height 메타가 있어야 한다')
    assert.ok(w.every((x) => x === size.w), `width ${w} != ${size.w}`)
    assert.ok(h.every((x) => x === size.h), `height ${h} != ${size.h}`)
  })

  test(`${name}: og:image와 twitter:image 주소가 같은 버전이다`, () => {
    const t = read(src)
    const all = [...t.matchAll(/og-image\.png(\?v=\d+)?/g)].map((m) => m[0])
    assert.ok(all.length > 0)
    assert.equal(new Set(all).size, 1, `주소 버전이 섞였다: ${[...new Set(all)]}`)
    assert.ok(all[0].includes('?v='), '이미지를 바꿀 때 메신저 캐시를 피하려면 ?v=가 있어야 한다')
  })
}
