import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { apiFile } from './api-repo.mjs'

// 웹 소스는 이 저장소 뿌리에서, 허용 목록은 API 저장소에서 읽는다(api-repo.mjs).
const root = new URL('..', import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), 'utf8')
}

function staticTrackEvents(path, contents) {
  const calls = [...contents.matchAll(/\btrack\s*\(/g)]
  const staticCalls = [...contents.matchAll(/\btrack\s*\(\s*(['"])([^'"]+)\1/g)]
  assert.equal(
    staticCalls.length,
    calls.length,
    `${path}: 동적 track() 이벤트명은 API 허용 목록과 정적으로 대조할 수 없습니다.`,
  )
  return staticCalls.map((match) => match[2])
}

// 웹 src 전체를 훑는다. 예전엔 파일을 손으로 적어, 목록에서 빠진 파일(2026-10-17 PopularDock.jsx 등)의 이벤트는
// 서버 허용 목록과 대조되지 않았다. analytics.js는 track 정의가 있어 startAnalytics 아래만 본다. 테스트 파일은 뺀다.
async function srcFiles(dir = 'src/') {
  const out = []
  for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const p = `${dir}${e.name}`
    if (e.isDirectory()) out.push(...await srcFiles(`${p}/`))
    else if (/\.(js|jsx)$/.test(e.name) && !/\.test\.js$/.test(e.name)) out.push(p)
  }
  return out
}
const scanned = []
for (const p of await srcFiles()) {
  let text = await source(p)
  if (p === 'src/analytics.js') text = text.slice(text.indexOf('export function startAnalytics()'))
  scanned.push(...staticTrackEvents(p, text))
}const controllerSource = await readFile(
  apiFile('src', 'main', 'java', 'com', 'discounttracker', 'analytics', 'EventController.java'),
  'utf8',
)

const emittedEvents = new Set([...scanned, 'page_exit'])

const allowedBlock = controllerSource.match(/ALLOWED_EVENTS\s*=\s*Set\.of\(([\s\S]*?)\);/)
assert.ok(allowedBlock, 'EventController.ALLOWED_EVENTS를 찾을 수 없습니다.')
const allowedEvents = new Set([...allowedBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]))
const missingEvents = [...emittedEvents].filter((event) => !allowedEvents.has(event)).sort()
const unusedAllowedEvents = [...allowedEvents]
  .filter((event) => !emittedEvents.has(event))
  .sort()

assert.deepEqual(missingEvents, [], `API 허용 목록에서 빠진 이벤트: ${missingEvents.join(', ')}`)
assert.deepEqual(
  unusedAllowedEvents,
  [],
  `프론트에서 발행하지 않는 API 허용 이벤트: ${unusedAllowedEvents.join(', ')}`,
)
console.log('analytics frontend/API event contract: PASS')
