// 바뀐 주소를 빙·네이버·얀덱스에 바로 알린다(IndexNow).
//
// 구글은 이 규약을 안 쓴다 — 구글 쪽은 서치콘솔에서 사람이 사이트맵을
// 제출해야 하고 그건 계정 로그인이 필요해 자동화할 수 없다. 반면
// IndexNow는 키 파일 하나만 사이트에 올려 두면 계정 없이 POST로 알린다.
//
// 이 사이트는 하루 한 번 데이터가 통째로 바뀌는데(배너는 매일 10시 갱신),
// 크롤러가 스스로 다시 올 때까지 기다리면 그 사이 화면과 검색 결과가
// 어긋난다. 그래서 배포 뒤에 한 번 쏜다.
//
// 키 파일은 web/public/<key>.txt이고 내용이 키 자신이다 — 그게 이 도메인을
// 우리가 통제한다는 증명이다. 파일을 지우면 알림이 전부 거부된다.
//
// 쓰는 법:
//   node scripts/indexnow.mjs            # 사이트맵 전체를 알린다
//   node scripts/indexnow.mjs --dry-run  # 무엇을 보낼지만 본다

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = 'https://beggars-five.vercel.app'
const KEY = 'fcef50a16763ab3b091826456f17ed38'
const ENDPOINT = 'https://api.indexnow.org/indexnow'
// 한 번에 보낼 수 있는 상한이 10,000이다. 지금은 111개라 나눌 일이 없지만
// 브랜드가 늘면 여기서 잘린다는 걸 알아볼 수 있게 상수로 둔다.
const MAX_URLS = 10000

function urlsFromSitemap() {
  const xml = readFileSync(join(HERE, '..', 'dist', 'sitemap.xml'), 'utf8')
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
}

const dryRun = process.argv.includes('--dry-run')
const urlList = urlsFromSitemap().slice(0, MAX_URLS)

if (urlList.length === 0) {
  // 빈 목록을 보내면 400이 온다. 사이트맵을 못 읽은 것과 구분해서
  // 알리는 편이 낫다 — 조용히 성공한 척하면 며칠 뒤에나 안다.
  console.error('사이트맵에서 주소를 하나도 못 읽었다 — 빌드부터 확인할 것')
  process.exit(1)
}

console.log(`${urlList.length}개 주소를 알린다 (키 ${KEY.slice(0, 8)}…)`)
if (dryRun) {
  console.log(urlList.slice(0, 5).join('\n'))
  console.log('…\n미리보기다. 실제로 보내려면 --dry-run 없이')
  process.exit(0)
}

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList,
  }),
})

// 200과 202 둘 다 정상이다 — 202는 "받았고 키는 나중에 확인하겠다"는 뜻이다.
console.log(`${res.status} ${res.statusText}`)
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text())
  process.exit(1)
}
