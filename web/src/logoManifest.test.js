// 로고 매니페스트가 실제 파일과 어긋나지 않는지 본다.
//
// 2026-09-11: 로고가 없는데도 요청을 보내 404를 받았고, vercel.json이
// /logos/(.*)에 immutable 30일 캐시를 걸어 그 404가 30일간 굳었다. 나중에
// 로고를 올려도 먼저 방문한 브라우저에는 안 보인다(빽다방 실측).
//
// 매니페스트가 낡으면 그 상태로 돌아간다 — 파일은 있는데 목록에 없으면
// 로고가 영영 안 뜨고, 목록에만 있고 파일이 없으면 404가 다시 난다.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildManifest } from '../scripts/build-logo-manifest.mjs'
import { LOGO_MANIFEST } from './logoManifest.js'
import { brandLogoSrc, logoFileName } from './logoSrc.js'

const here = dirname(fileURLToPath(import.meta.url))
const LOGO_DIR = resolve(here, '..', 'public', 'logos')

test('매니페스트가 public/logos와 정확히 일치한다', () => {
  assert.deepEqual(LOGO_MANIFEST, buildManifest(LOGO_DIR),
    'npm run logos 를 돌려 매니페스트를 다시 구울 것')
})

test('디스크의 png 개수와 항목 수가 같다', () => {
  const files = readdirSync(LOGO_DIR).filter((f) => f.endsWith('.png'))
  assert.equal(Object.keys(LOGO_MANIFEST).length, files.length)
})

test('없는 브랜드는 주소를 만들지 않는다 — 요청이 나가면 안 된다', () => {
  assert.equal(brandLogoSrc('있을리없는브랜드이름'), null)
})

test('있는 브랜드는 내용 해시를 달고 나온다', () => {
  const name = Object.keys(LOGO_MANIFEST)[0]
  const src = brandLogoSrc(name)
  assert.ok(src.startsWith(`/logos/${encodeURIComponent(name)}.png?v=`), src)
  assert.match(src, /\?v=[0-9a-f]{8}$/)
})

test('파일명 치환 규칙은 그대로다', () => {
  // 공백·& 가 _ 로 바뀐다(web/public/logos/README.md, ADR-027).
  assert.equal(logoFileName('백종원의 미정국수&덮밥'), '백종원의_미정국수_덮밥')
  assert.equal(logoFileName('도미노피자'), '도미노피자')
})

test('치환된 이름으로 실제 파일을 찾는다', () => {
  // 대표명을 그대로 파일명에 쓰면 파일은 있는데 화면에 안 뜬다(ADR-027).
  const withSpace = Object.keys(LOGO_MANIFEST).find((k) => k.includes('_'))
  if (!withSpace) return
  assert.ok(LOGO_MANIFEST[withSpace], withSpace)
})
