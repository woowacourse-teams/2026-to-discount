import { test } from 'node:test'
import assert from 'node:assert/strict'

// 하이드레이션 동안은 서버가 그린 시각, goLive 뒤에는 실시간. window.__SSR__를 심은 뒤 모듈을 처음 읽는다(상태가 모듈에 있어 한 파일에 한 시나리오). 오픈 시각을 00:01로 두어 하루 중 1분을 빼고는 안정적이다.
test('SSR 데이터가 있으면 goLive 전까지 서버 시각으로 고정한다', async () => {
  const renderedAt = Date.parse('2026-11-11T15:00:00Z') // KST 00:00
  globalThis.window = { __SSR__: { renderedAt } }
  const { pageNow, goLive } = await import('./pageNow.js')
  const { beforeOpen } = await import('./couponModel.js')
  const offer = { badge: '오전 12시 1분 오픈' }
  assert.equal(pageNow().getTime(), renderedAt)
  assert.equal(beforeOpen(offer), true) // 서버가 그린 09:59엔 아직 오픈 전
  goLive()
  assert.ok(Math.abs(pageNow().getTime() - Date.now()) < 1000)
  assert.equal(beforeOpen(offer), false) // 지금(오픈 시각을 지난 뒤)은 열렸다
  delete globalThis.window
})
