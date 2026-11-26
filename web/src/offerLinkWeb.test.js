import test from 'node:test'
import assert from 'node:assert/strict'

// 웹 페이지로 가는 오퍼(네이버페이, 홈페이지 버튼)는 "설치된 배달앱이 실행돼요" 안내를 띄우지 않는다(2026-11-26 사용자).
// watchAppOpen은 모듈 안 상태(watching)를 쥐므로 이 파일만 따로 돈다.
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

const { openWithNotice, opensWeb } = await import('./offerLink.js')

function fakeBrowser() {
  const shown = []
  const store = { getItem: () => null, setItem() {}, removeItem() {} }
  setGlobal('localStorage', store)
  setGlobal('sessionStorage', store)
  setGlobal('navigator', { doNotTrack: '1', globalPrivacyControl: true }) // track()이 privacy.js에서 읽는다. CI의 Node에는 전역이 없다
  setGlobal('location', { search: '', hostname: 'example.test', pathname: '/' })
  const el = () => ({ remove() {}, appendChild() {}, setAttribute() {}, addEventListener() {} })
  const body = { ...el(), appendChild: (x) => shown.push(x) }
  setGlobal('document', { querySelector: () => null, createElement: el, body, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} })
  setGlobal('window', { location: {}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), dispatchEvent() {} })
  return shown
}

test('opensWeb: 네이버페이 현장결제와 자사 행사만 웹으로 간다', () => {
  assert.equal(opensWeb({ via: 'naverpay', platform: 'baemin' }), true)
  assert.equal(opensWeb({ platform: 'own' }), true)
  assert.equal(opensWeb({ platform: 'baemin' }), false)
  assert.equal(opensWeb(undefined), false)
})

test('웹으로 가는 링크는 2.5초 뒤 설치 안내를 안 띄우고, 앱 링크는 띄운다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const shown = fakeBrowser()
  const ev = { preventDefault() {} }
  openWithNotice(ev, 'https://blog.naver.com/x', { web: true })
  t.mock.timers.tick(3000)
  assert.equal(shown.length, 0)
  openWithNotice(ev, 'https://baemin.me/x')
  t.mock.timers.tick(3000)
  assert.equal(shown.length, 1)
  for (const k of ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'navigator']) delete globalThis[k]
})
