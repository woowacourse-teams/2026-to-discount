import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

const appSource = await source('src/App.jsx')
// App.jsx에서 떼어 낸 카드와 칩. offer_link_click·brand_expand·brand_impression을 여기서 쏜다.
const brandCardSource = await source('src/BrandCard.jsx')
const offerChipSource = await source('src/OfferChip.jsx')
// 메인 화면 A/B의 쿠폰 카드(2026-10-04). 목록에서 빠져 있어 이 카드가 쏘는 이벤트는 대조되지 않았다.
const couponCardSource = await source('src/CouponCard.jsx')
const eventStripSource = await source('src/EventStrip.jsx')
const bannerSource = await source('src/EventBanner.jsx')
// 상단 바(옛 A안 — 2026-09-15 B를 내리고 하나로 통일). 이 파일이 목록에서 빠져 있으면 A안에서만 쏘는 이벤트가
// 허용 목록에 없어도 검사를 통과한다 — 정확히 그렇게 여섯 종이 서버에서
// 버려지고 있었다.
const topBarASource = await source('src/TopBarA.jsx')
// 설문 카드. 이 파일이 목록에서 빠지면 survey_impression·survey_dismiss가
// 서버 허용 목록에 없어도 검사를 통과하고, 서버가 조용히 버린다.
const surveyCardSource = await source('src/SurveyCard.jsx')
const surveyDockSource = await source('src/SurveyDock.jsx')
// 필터 시트. membership_toggle(시트의 멤버십 칩)을 여기서 쏜다.
const filterSheetSource = await source('src/FilterSheet.jsx')
// 푸시 설정. 구독 결과 이벤트도 자체 API 원장으로 릴레이하므로 목록에서
// 빠지면 API가 이름을 모른 채 조용히 버린다.
const pushNotificationSettingSource = await source('src/PushNotificationSetting.jsx')
const analyticsSource = await source('src/analytics.js')
const startAnalyticsSource = analyticsSource.slice(
  analyticsSource.indexOf('export function startAnalytics()'),
)
const controllerSource = await readFile(
  apiFile('src', 'main', 'java', 'com', 'discounttracker', 'analytics', 'EventController.java'),
  'utf8',
)

const emittedEvents = new Set([
  ...staticTrackEvents('src/App.jsx', appSource),
  ...staticTrackEvents('src/BrandCard.jsx', brandCardSource),
  ...staticTrackEvents('src/OfferChip.jsx', offerChipSource),
  ...staticTrackEvents('src/CouponCard.jsx', couponCardSource),
  ...staticTrackEvents('src/EventStrip.jsx', eventStripSource),
  ...staticTrackEvents('src/EventBanner.jsx', bannerSource),
  ...staticTrackEvents('src/TopBarA.jsx', topBarASource),
  ...staticTrackEvents('src/SurveyCard.jsx', surveyCardSource),
  ...staticTrackEvents('src/SurveyDock.jsx', surveyDockSource),
  ...staticTrackEvents('src/FilterSheet.jsx', filterSheetSource),
  ...staticTrackEvents('src/PushNotificationSetting.jsx', pushNotificationSettingSource),
  ...staticTrackEvents('src/analytics.js#startAnalytics', startAnalyticsSource),
  'page_exit',
])

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
