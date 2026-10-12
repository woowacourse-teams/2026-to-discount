// 개발용 산출물에 운영 API 주소가 들어가면 도메인을 갱신하기 전에 실패한다.
import { readdir, readFile } from 'node:fs/promises'
import { DEVELOPMENT_API, PRODUCTION_API } from '../src/apiBase.js'

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map((e) => e.isDirectory()
    ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))).flat()
}
for (const dir of ['dist', 'dist-server']) {
  const paths = (await files(dir)).filter((p) => /\.(js|html)$/.test(p))
  let developmentFound = false
  for (const path of paths) {
    const text = await readFile(path, 'utf8')
    // 검증 함수 안의 운영 비교 상수는 남아도 된다. 실제 요청 상수와 초기 fetch를 검사한다.
    if (text.includes(DEVELOPMENT_API)) developmentFound = true
    if (text.includes(PRODUCTION_API + '/api/')) {
      throw new Error(`${path}: 운영 API 직접 요청이 포함되어 있다`)
    }
  }
  if (!developmentFound) throw new Error(`${dir}: 개발 API 주소가 없다`)
}
console.log('development output: PASS')

// 번들에 검증용 운영 비교 상수가 남아도 실제 SSR fetch는 개발 origin이어야 한다.
const requests = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  requests.push(String(url))
  return { ok: true, json: async () => [] }
}
try {
  const { loadData } = await import('../dist-server/entry-server.js')
  await loadData()
} finally { globalThis.fetch = originalFetch }
if (requests.length !== 2 || requests.some((url) => !url.startsWith(DEVELOPMENT_API + '/api/'))) {
  throw new Error('SSR 요청이 개발 API에 연결되지 않았다')
}
console.log('development SSR requests: PASS')
