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
  return import(pathToFileURL(out).href)
}
const CardModule = await load('CouponCard')
const Coupon = CardModule.default
const { Tags } = CardModule
// 운영 카드(BrandCard, 2026-10-17 삭제)가 같은 브랜드에 그리던 요소 수. 쿠폰 카드는 이보다 늘지 않는다.
const OLD_CARD_ELEMENTS = { 단독최고: 124, 동점셋: 126, 최적: 71 }

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
    const c = count(render(Coupon, brand)), b = OLD_CARD_ELEMENTS[label]
    console.log(`  ${label}: 쿠폰 ${c} / 운영 ${b}`)
    assert.ok(c <= b, `쿠폰 카드 ${c}개 > 운영 카드 ${b}개`)
  })
}

test('복합(중복 할인)은 카드 머리에 안 뜬다(상세에서만, #151). 동점은 쿠폰마다 캐러셀 슬라이드와 점', () => {
  const combo = render(Coupon, BRANDS.최적)
  assert.match(combo, /class="cc-fx cc-badges">/)
  assert.doesNotMatch(combo, /cc-combo/)
  assert.doesNotMatch(combo, /class="cc-fx">25,000원/) // 계산식은 (i) 설명으로 옮겼다
  const tie = render(Coupon, BRANDS.동점셋)
  assert.equal((tie.match(/class="cc-slide[ "]/g) ?? []).length, 3)
  assert.equal((tie.match(/cc-slide--cur/g) ?? []).length, 1) // 서버 렌더에서는 첫 쿠폰이 지금 쿠폰
  assert.match(tie, /class="cc-dots"[^>]*><i class="on"><\/i><i><\/i><i><\/i>/)
  assert.doesNotMatch(tie, /class="cc-fx"/)
})

// 서버가 그린 카드를 lazy 경계로 감싸면 코드 조각이 오기 전 갱신에 React가 서버 화면을 버리고 다시 그린다
// (React #421이 카드 수만큼, 쿠폰 쪽 TBT 2.3초, 스크롤 중 13초 멈춤, 2026-10-14). 카드는 정적으로 싣는다.
test('서버가 그리는 카드 컴포넌트는 lazy로 싣지 않는다', async () => {
  const { readFile } = await import('node:fs/promises')
  const app = await readFile(path.join(here, 'App.jsx'), 'utf8')
  for (const card of ['CouponCard']) assert.doesNotMatch(app, new RegExp(`lazy\\(\\(\\) => import\\('\\./${card}\\.jsx'\\)\\)`), card)
})

// #151: 카드와 상세가 같은 목록에서 뽑되 Tags가 자리마다 맞게 거른다.
const renderTags = (offer, detail) => renderToStaticMarkup(createElement(Tags, { o: offer, detail }))
const combo = o('yogiyo', 5250, { qualifier: '최적', conditions: '25,000원 × 5% + 4,000원', tiers: [
  { amount: 5250, channel: '배달', membership: 'baeminClub', note: '선착순' }, { amount: 3000 }] })

test('Tags: 카드는 중복 할인이 안 뜨고 채널 칩이 뜬다, 상세는 둘 다 뜬다', () => {
  const card = renderTags(combo, false), det = renderTags(combo, true)
  assert.doesNotMatch(card, /중복 할인/)
  assert.match(card, />배달</)
  assert.match(det, /중복 할인/)
  assert.match(det, />배달</)
})

test('Tags: 상세에 condition 칩(클래스)과 멤버십 칩이 뜬다', () => {
  const cu = renderTags(o('coupangeats', 7000, { conditions: '첫 주문' }), true)
  assert.match(cu, /offer__range-badge--condition[^>]*>첫 주문</)
  assert.match(renderTags(o('baemin', 3000, { membership: 'baeminClub' }), true), /배민클럽/)
})

test('상세 Tags 호출부는 소스에 정확히 두 곳(펼친 목록, 시트)이다', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(path.join(here, 'CouponCard.jsx'), 'utf8')
  assert.equal((src.match(/<Tags o=\{o\} detail \/>/g) ?? []).length, 2)
})