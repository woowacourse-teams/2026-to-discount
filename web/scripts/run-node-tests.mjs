// src/ 아래 *.test.js를 전부 node:test로 돈다. 파일을 package.json에 하나씩 적던 때는 새 테스트를
// 적는 걸 잊으면 조용히 안 돌았다. 이 저장소의 단위 테스트는 node:test 하나로 쓴다 - vitest로
// 돌리면 "0 test"로 뜬다(2026-09-29 감사). 섞이지 않게 여기서 막는다.
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = fileURLToPath(new URL('..', import.meta.url))
const SRC = path.join(WEB, 'src')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : e.name.endsWith('.test.js') ? [p] : []
  })
}

const files = walk(SRC).sort()
if (files.length === 0) {
  console.error('src/ 아래 *.test.js가 하나도 없다. 테스트 없이 초록이 되지 않게 실패한다')
  process.exit(1)
}
const strays = files.filter((f) => {
  const text = readFileSync(f, 'utf8')
  return !text.includes("from 'node:test'") || /from ['"]vitest['"]/.test(text)
})
if (strays.length) {
  console.error('node:test를 쓰지 않는 테스트 파일이 있다. 이 저장소는 node:test 하나로 돈다:\n  '
    + strays.map((f) => path.relative(WEB, f)).join('\n  '))
  process.exit(1)
}
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: WEB })
process.exit(run.status ?? 1)
