// 운영 칩의 HTML이 바뀌면 안 된다(홈 A안 1단계: 배지 계산을 badgesOf로 옮기는 리팩터링의 안전망).
// JSX를 node:test에서 읽으려고 esbuild로 한 번 묶는다(vite가 이미 쓰는 도구).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const here = path.dirname(fileURLToPath(import.meta.url))
const SNAP = path.join(here, 'offerChip.snapshot.json')

const dir = path.join(here, '..', 'node_modules', '.cache', 'chip-test') // react를 찾을 수 있는 자리
const out = path.join(dir, 'chip.mjs')
await build({
  entryPoints: [path.join(here, 'OfferChip.jsx')], outfile: out, bundle: true, format: 'esm', platform: 'node',
  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl' },
})
const { default: OfferChip } = await import(pathToFileURL(out).href)

const base = { platform: 'baemin', amount: 7000, minOrderAmount: 18000, status: 'confirmed' }
const CASES = {
  plain: { offer: base },
  max: { offer: { ...base, qualifier: '최대' } },
  random: { offer: { ...base, qualifier: '랜덤' } },
  menu: { offer: { ...base, qualifier: '특정메뉴' } },
  bestFitHidden: { offer: { ...base, platform: 'yogiyo', qualifier: '최적' } },
  rate: { offer: { ...base, badge: '5%할인' } },
  rateBestHidesIt: { offer: { ...base, badge: '5%할인' }, best: true },
  maxBest: { offer: { ...base, qualifier: '최대' }, best: true },
  club: { offer: { ...base, membership: 'baeminClub' } },
  wow: { offer: { ...base, platform: 'coupangeats', membership: 'coupangEats' } },
  legacyMember: { offer: { ...base, platform: 'ddangyo', badge: '땡겨요 전용쿠폰' } },
  time: { offer: { ...base, firstCome: true, badge: '오전 11시 오픈' } },
  period: { offer: { ...base, badge: '~9/30' } },
  all: { offer: { ...base, qualifier: '랜덤', membership: 'baeminClub', badge: '오늘 17시 선착순' } },
  soldOut: { offer: { ...base, soldOut: true }, best: true, hero: true },
  rawText: { offer: { platform: 'own', amount: null, rawText: '1+1' } },
  held: { offer: { ...base, status: 'held' } },
  capped: { offer: { ...base, qualifier: '최대' }, include: { random: false, menu: false } },
  linked: { offer: { ...base, link: 'https://example.com/a' }, brandLinks: { baemin: 'https://b' } },
  brandLink: { offer: base, brandLinks: { baemin: 'https://b' } },
  noLink: { offer: { ...base, platform: 'unknown' } },
}

function render() {
  return Object.fromEntries(Object.entries(CASES).map(([k, c]) => [k, renderToStaticMarkup(
    createElement(OfferChip, { brandName: 'BBQ', brandLinks: c.brandLinks, best: c.best, hero: c.hero, include: c.include, offer: c.offer, detailId: 'd', open: false, onToggle() {}, position: 1 })).replace(/src="data:[^"]*"/g, 'src="data:"')]))
}

test('운영 칩 HTML 스냅숏', () => {
  const got = render()
  if (process.env.UPDATE_SNAPSHOT === '1') { writeFileSync(SNAP, JSON.stringify(got, null, 2) + '\n', { encoding: 'utf8' }); return }
  assert.deepEqual(got, JSON.parse(readFileSync(SNAP, 'utf8')))
})
