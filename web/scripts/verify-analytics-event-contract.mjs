import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../..', import.meta.url)

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

const appSource = await source('web/src/App.jsx')
const bannerSource = await source('web/src/EventBanner.jsx')
const filterSheetSource = await source('web/src/FilterSheet.jsx')
// A안 상단 바. 이 파일이 목록에서 빠져 있으면 A안에서만 쏘는 이벤트가
// 허용 목록에 없어도 검사를 통과한다 — 정확히 그렇게 여섯 종이 서버에서
// 버려지고 있었다.
const topBarASource = await source('web/src/TopBarA.jsx')
// 설문 카드. 이 파일이 목록에서 빠지면 survey_impression·survey_dismiss가
// 서버 허용 목록에 없어도 검사를 통과하고, 서버가 조용히 버린다.
const surveyCardSource = await source('web/src/SurveyCard.jsx')
const surveyDockSource = await source('web/src/SurveyDock.jsx')
const analyticsSource = await source('web/src/analytics.js')
const startAnalyticsSource = analyticsSource.slice(
  analyticsSource.indexOf('export function startAnalytics()'),
)
const controllerSource = await source(
  'api/src/main/java/com/discounttracker/analytics/EventController.java',
)

const emittedEvents = new Set([
  ...staticTrackEvents('web/src/App.jsx', appSource),
  ...staticTrackEvents('web/src/EventBanner.jsx', bannerSource),
  ...staticTrackEvents('web/src/FilterSheet.jsx', filterSheetSource),
  ...staticTrackEvents('web/src/TopBarA.jsx', topBarASource),
  ...staticTrackEvents('web/src/SurveyCard.jsx', surveyCardSource),
  ...staticTrackEvents('web/src/SurveyDock.jsx', surveyDockSource),
  ...staticTrackEvents('web/src/analytics.js#startAnalytics', startAnalyticsSource),
  'page_exit',
])

const allowedBlock = controllerSource.match(/ALLOWED_EVENTS\s*=\s*Set\.of\(([\s\S]*?)\);/)
assert.ok(allowedBlock, 'EventController.ALLOWED_EVENTS를 찾을 수 없습니다.')
const allowedEvents = new Set([...allowedBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]))
const missingEvents = [...emittedEvents].filter((event) => !allowedEvents.has(event)).sort()
const unusedAllowedEvents = [...allowedEvents].filter((event) => !emittedEvents.has(event)).sort()

assert.deepEqual(missingEvents, [], `API 허용 목록에서 빠진 이벤트: ${missingEvents.join(', ')}`)
assert.deepEqual(
  unusedAllowedEvents,
  [],
  `프론트에서 발행하지 않는 API 허용 이벤트: ${unusedAllowedEvents.join(', ')}`,
)
console.log('analytics frontend/API event contract: PASS')
