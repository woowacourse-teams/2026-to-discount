// public/logos/*.png 목록을 src/logoManifest.js로 굽는다.
//
// ## 왜 필요한가
//
// 지금은 로고가 있든 없든 브랜드마다 `/logos/<이름>.png`를 요청한다.
// 없으면 404가 돌아오는데, `vercel.json`이 `/logos/(.*)` 경로에
// `max-age=2592000, immutable`을 거는 탓에 **그 404가 30일간 캐시된다.**
// `immutable`은 재검증도 하지 말라는 뜻이라, 나중에 로고를 올려도
// 기존 방문자에게는 30일 동안 안 보인다.
//
// 2026-09-11 실측: 빽다방 로고를 올린 뒤에도 먼저 방문했던 브라우저는
// 첫 글자 대체("빽")를 계속 봤다. 빽다방만의 문제가 아니라 **앞으로
// 추가하는 모든 로고**가 같은 일을 겪는다.
//
// ## 무엇을 하나
//
// 파일마다 내용 해시 8자를 매니페스트에 적는다.
//
//   - 목록에 없으면 **요청을 아예 안 한다.** 404가 생기지 않으니 캐시될
//     것도 없다. 덤으로 로고 없는 브랜드만큼 Edge Requests가 준다 —
//     한도를 요청 수로 세는 서비스다(2026-09-07 75% 경고).
//   - 있으면 `/logos/<이름>.png?v=<해시>`로 요청한다. 해시는 파일이
//     바뀔 때만 바뀌므로 기존 로고는 30일 immutable 캐시를 그대로 누리고,
//     새로 넣거나 교체한 로고는 URL이 달라져 옛 캐시를 즉시 비켜 간다.
//
// 매니페스트는 해시된 JS 번들에 실리므로 매니페스트 자체는 낡지 않는다.
//
// ## 언제 돌리나
//
// `npm run build`가 자동으로 부른다. 로고를 넣고 빌드만 하면 된다.
//
//     node scripts/build-logo-manifest.mjs
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LOGO_DIR = resolve(here, '..', 'public', 'logos')
const OUT = resolve(here, '..', 'src', 'logoManifest.js')

// 파일명은 대표명에 brandLogoSrc()의 치환을 적용한 것이다. 여기서는
// 파일명을 그대로 키로 쓰고, 치환은 부르는 쪽이 한다 — 양쪽이 같은
// 규칙을 두 번 구현하면 언젠가 갈라진다.
export function buildManifest(dir = LOGO_DIR) {
  const out = {}
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.png')) continue
    const key = file.slice(0, -'.png'.length)
    const hash = createHash('sha256')
      .update(readFileSync(join(dir, file)))
      .digest('hex')
      .slice(0, 8)
    out[key] = hash
  }
  return out
}

export function render(manifest) {
  const body = Object.entries(manifest)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')
  return `// 자동 생성 — scripts/build-logo-manifest.mjs\n`
    + `// 손으로 고치지 않는다. 로고를 넣고 \`npm run build\`를 돌리면 갱신된다.\n`
    + `//\n`
    + `// 값은 파일 내용 해시 8자다. 파일이 바뀔 때만 바뀌므로 캐시가 유지되고,\n`
    + `// 바뀌면 URL이 달라져 옛 캐시(404 포함)를 비켜 간다.\n`
    + `export const LOGO_MANIFEST = {\n${body}\n}\n`
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const manifest = buildManifest()
  writeFileSync(OUT, render(manifest), 'utf8')
  console.log(`로고 ${Object.keys(manifest).length}개 -> src/logoManifest.js`)
}
