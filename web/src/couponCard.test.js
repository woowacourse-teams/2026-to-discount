// 쿠폰 카드가 운영 카드보다 화면 요소를 늘리지 않는다(홈 총 차단 시간 예산). 접힌 상태 기준.
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(here, '..', 'node_modules', '.cache', 'chip-test') // react를 찾을 수 있는 자리
async function load(name) {
  const out = path.join(dir, `${name}.mjs`)
  await build({
    entryPoints: [path.join(here, `${name}.jsx`)], outfile: out, bundle: true, format: 'esm', platform: 'node',
    jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' },
  })
  return (await import(pathToFileURL(out).href)).default
}
const Coupon = await load('CouponCard')
const Brand = await load('BrandCard')

const o = (platform, amount, extra = {}) => ({ platform, amount, status: 'confirmed', minOrderAmount: 18000, ...extra })
const BRANDS = {
  단독최고: { name: 'BBQ', offers: [o('baemin', 7500), o('coupangeats', 10000), o('ddangyo', 5000), o('yogiyo', 3000)] },
  동점셋: { name: '도미노피자', offers: [o('baemin', 7000, { badge: '오전 11시 오픈' }), o('ddangyo', 7000), o('yogiyo', 7000), o('coupangeats', 4000)] },
  최적: { name: '청년피자', offers: [o('yogiyo', 5250, { qualifier: '최적', conditions: '25,000원 × 5% + 4,000원' }), o('baemin', 4000)] },
}
const count = (html) => (html.match(/<[a-z][^>]*>/g) ?? []).length
const render = (C, brand) => renderToStaticMarkup(createElement(C, { brand, position: 1, include: null, onHide() {} }))

for (const [label, brand] of Object.entries(BRANDS)) {
  test(`카드당 요소 수: ${label}는 운영 카드 이하`, () => {
    const c = count(render(Coupon, brand)), b = count(render(Brand, brand))
    console.log(`  ${label}: 쿠폰 ${c} / 운영 ${b}`)
    assert.ok(c <= b, `쿠폰 카드 ${c}개 > 운영 카드 ${b}개`)
  })
}

test('최적 계산식은 이름 줄 아래, 동점은 쿠폰마다 캐러셀 슬라이드와 점', () => {
  assert.match(render(Coupon, BRANDS.최적), /class="cc-fx">25,000원 × 5% \+ 4,000원</)
  const tie = render(Coupon, BRANDS.동점셋)
  assert.equal((tie.match(/class="cc-slide"/g) ?? []).length, 3)
  assert.match(tie, /class="cc-dots"[^>]*><i class="on"><\/i><i><\/i><i><\/i>/)
  assert.doesNotMatch(tie, /class="cc-fx"/)
})
