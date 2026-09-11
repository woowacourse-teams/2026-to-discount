// ADR-001이 코드와 갈라지지 않게 지킨다.
//
// ADR-001(2026-07-28)은 "백엔드 주소를 절대값으로 고정, 프록시·환경변수
// 없이"로 확정됐다. 그런데 어느 시점에 API_BASE가 ''로 돌아가고
// vercel.json에 rewrite가 생겨 프록시 구조로 되돌아갔다. **ADR은 그대로
// "확정"이었고 두 달 가까이 아무도 몰랐다.**
//
// 되돌아가면 두 가지가 같이 나빠진다.
//   - 방문당 여섯 건쯤이 Vercel Edge Requests로 계산된다(한도는 요청 수).
//   - `vite preview`나 프록시 없는 환경에서 상대경로가 프론트 자기 자신을
//     때려 "조용한 빈 화면"이 된다(ADR-001의 원래 동기).
//
//     node scripts/verify-api-base.mjs
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8')

const fail = []

const api = read('src/api.js')
const m = api.match(/export const API_BASE = '([^']*)'/)
if (!m) {
  fail.push("src/api.js에 `export const API_BASE = '...'` 가 없다")
} else if (!/^https:\/\/\S+$/.test(m[1])) {
  fail.push(`API_BASE가 절대주소가 아니다: ${JSON.stringify(m[1])} (ADR-001)`)
}

// 프록시로 되돌아가는 다른 경로 — vercel.json의 /api rewrite.
const vercel = JSON.parse(read('vercel.json'))
const apiRewrite = (vercel.rewrites ?? []).find((r) => String(r.source).startsWith('/api'))
if (apiRewrite) {
  fail.push(`vercel.json에 /api rewrite가 있다: ${JSON.stringify(apiRewrite)} (ADR-001)`)
}

// 주소를 여기저기 박지 않는다. api.js 말고 다른 곳에 리터럴이 있으면
// 한 곳만 고치는 날 나머지가 조용히 어긋난다.
for (const f of ['src/analytics.js', 'src/App.jsx', 'src/SurveyCard.jsx']) {
  let text
  try {
    text = read(f)
  } catch {
    continue
  }
  if (text.includes('bebeggars.duckdns.org')) {
    fail.push(`${f}가 백엔드 주소를 직접 들고 있다 — api.js의 API_BASE를 import할 것`)
  }
}

if (fail.length) {
  console.error('api base: FAIL')
  for (const line of fail) console.error(`  - ${line}`)
  process.exit(1)
}
console.log('api base: PASS')
