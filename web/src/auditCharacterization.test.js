import test from 'node:test'
import assert from 'node:assert/strict'

// 리팩토링 전 특성 테스트(2026-11-26 점검 03~05의 '중' 이상). 지금 동작을 못박는다.
// 지적된 버그 재현은 test.skip('audit: ...')로 둔다. 고친 뒤 skip을 풀면 돈다.

function store(values = new Map()) {
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}
function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

// ---- analytics-context: getAnalyticsContext ----
let loads = 0
async function loadContext({ search = '', hostname = 'example.test', local = store(), session = store() } = {}) {
  setGlobal('location', { search, hostname })
  setGlobal('localStorage', local)
  setGlobal('sessionStorage', session)
  return import(`./analytics-context.js?ctx=${++loads}`)
}

test('analytics-context: 첫 방문은 v_/s_ 아이디와 방문 1회', async () => {
  const local = store()
  const { getAnalyticsContext } = await loadContext({ local })
  const c = getAnalyticsContext()
  assert.match(c.visitorId, /^v_[0-9a-f]{16}$/)
  assert.match(c.sessionId, /^s_[0-9a-f]{16}$/)
  assert.equal(c.visitCount, 1)
  assert.equal(local.values.get('dk_visits'), '1')
  assert.equal(getAnalyticsContext(), c, '한 페이지에서는 같은 객체')
})

test('analytics-context: 새 세션이면 방문 수가 오르고 방문자 id는 유지', async () => {
  const local = store(new Map([['dk_visitor', 'v_old'], ['dk_visits', '3']]))
  const { getAnalyticsContext } = await loadContext({ local })
  const c = getAnalyticsContext()
  assert.equal(c.visitorId, 'v_old')
  assert.equal(c.visitCount, 4)
})

test('analytics-context: 같은 세션이면 방문 수 그대로', async () => {
  const local = store(new Map([['dk_visitor', 'v_old'], ['dk_visits', '3']]))
  const session = store(new Map([['dk_session', 's_same']]))
  const c = (await loadContext({ local, session })).getAnalyticsContext()
  assert.equal(c.sessionId, 's_same')
  assert.equal(c.visitCount, 3)
})

test('analytics-context: 운영 호스트는 dev 없음, ?dev=1은 저장돼 다음에도 dev', async () => {
  const local = store()
  let c = (await loadContext({ hostname: 'beggars-five.vercel.app', local })).getAnalyticsContext()
  assert.equal(c.dev, undefined)
  c = (await loadContext({ hostname: 'beggars-five.vercel.app', search: '?dev=1', local })).getAnalyticsContext()
  assert.equal(c.dev, true)
  assert.equal(local.values.get('dk_dev'), '1')
  c = (await loadContext({ hostname: 'beggars-five.vercel.app', local })).getAnalyticsContext()
  assert.equal(c.dev, true)
})

test('analytics-context: 운영 밖 호스트는 ?dev=0이어도 dev', async () => {
  const c = (await loadContext({ hostname: 'preview.vercel.app', search: '?dev=0' })).getAnalyticsContext()
  assert.equal(c.dev, true)
})

test('analytics-context: 저장소가 막혀도 던지지 않는다', async () => {
  const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  const c = (await loadContext({ local: broken, session: broken })).getAnalyticsContext()
  assert.equal(c.visitorId, null)
  assert.equal(c.visitCount, 1)
})

test.skip('audit: analytics-context — location이 없으면(SSR) typeof 검사 전에 URLSearchParams(location.search)에서 죽는다', async () => {
  const mod = await loadContext()
  delete globalThis.location
  assert.doesNotThrow(() => mod.getAnalyticsContext())
})

// ---- offerLink ----
const offerLinkMod = await import('./offerLink.js')

test('offerLink: 요기요는 브랜드 링크가 없으면 앱 안 브랜드 검색', () => {
  assert.equal(offerLinkMod.offerLink({ platform: 'yogiyo' }, {}, 'BBQ 치킨'), 'yogiyolink://search?keyword=BBQ%20%EC%B9%98%ED%82%A8')
})

test('offerLink: 쿠팡이츠는 허브 배너를 받아도 허브 대신 고정 링크(setHubLinks는 쿠팡이츠 사다리에 안 닿는다)', () => {
  offerLinkMod.setHubLinks([{ platform: 'coupangeats', url: 'https://x/V5_HUB_0831' }])
  assert.equal(offerLinkMod.offerLink({ platform: 'coupangeats' }, {}, 'BBQ'), offerLinkMod.COUPANGEATS_LINK)
  offerLinkMod.setHubLinks([])
})

test('offerLink: 쿠팡이츠 앱 링크는 그대로, 문자열이 아니면 고정 링크', () => {
  assert.equal(offerLinkMod.offerLink({ platform: 'coupangeats', link: 'coupangeats://x?anchorTabNo=2' }), 'coupangeats://x?anchorTabNo=2')
  assert.equal(offerLinkMod.offerLink({ platform: 'coupangeats', link: 42 }), offerLinkMod.COUPANGEATS_LINK)
})

test('offerLink: setHubLinks는 url 없는 배너, null 목록을 건너뛴다', () => {
  assert.doesNotThrow(() => offerLinkMod.setHubLinks(null))
  assert.doesNotThrow(() => offerLinkMod.setHubLinks([null, { platform: 'coupangeats' }]))
})

test.skip('audit: offerLink — setHubLinks가 문자열 아닌 url(숫자 등)에서 includes로 죽는다', () => {
  assert.doesNotThrow(() => offerLinkMod.setHubLinks([{ platform: 'coupangeats', url: 1 }]))
})

test('offerLink: document가 없으면 openWithNotice는 이동을 막지 않는다', () => {
  let prevented = false
  offerLinkMod.openWithNotice({ preventDefault() { prevented = true } }, 'coupangeats://')
  assert.equal(prevented, false)
})

test('offerLink: offerClickProps 기본값', () => {
  const p = offerLinkMod.offerClickProps({ offer: { platform: 'baemin' }, brandName: 'BBQ', position: 1 })
  assert.equal(p.via, 'none')
  assert.equal(p.pin, 'none')
  assert.equal(p.tiers, 0)
  assert.equal(p.fromBanner, false)
  assert.equal(offerLinkMod.offerClickProps({ offer: { platform: 'baemin', link: 'x', linkSource: 'record' }, brandName: 'B' }).fromBanner, false)
})

test.skip('audit: offerLink — 쿠팡이츠 안내 중 두 번 누르면 앞 타이머가 살아 이동과 watchAppOpen이 두 번 돈다', () => {
  // DOM 흉내가 필요하다. 고칠 때 첫 dim이 지워지면 앞 타이머의 이동이 일어나지 않음을 확인한다.
  assert.fail('재현 미작성: offerLink.js:118-133 setTimeout을 clearTimeout하지 않는다')
})

// ---- cardId ----
const { brandCardId } = await import('./cardId.js')

test('cardId: 앞뒤 공백을 자르고 안쪽 공백은 _로', () => {
  assert.equal(brandCardId('  BBQ  치킨 '), 'brand-BBQ_치킨')
})

test.skip('audit: cardId — name이 없으면 trim에서 TypeError', () => {
  assert.doesNotThrow(() => brandCardId(undefined))
})

// ---- api.js ----
const api = await import('./api.js')

test('api: fetchHistory는 실패, 404에 null', async () => {
  setGlobal('fetch', async () => ({ ok: false }))
  assert.equal(await api.fetchHistory('BBQ'), null)
  setGlobal('fetch', async () => { throw new Error('net') })
  assert.equal(await api.fetchHistory('BBQ'), null)
})

test('api: fetchHistory는 브랜드 이름을 인코딩한다', async () => {
  let url
  setGlobal('fetch', async (u) => { url = u; return { ok: true, json: async () => [] } })
  await api.fetchHistory('A&B 치킨')
  assert.match(url, /\/api\/brands\/A%26B%20%EC%B9%98%ED%82%A8\/history\?range=1m$/)
})

test.skip('audit: api — fetchHistory가 range를 인코딩하지 않는다', async () => {
  let url
  setGlobal('fetch', async (u) => { url = u; return { ok: true, json: async () => [] } })
  await api.fetchHistory('BBQ', '1m&x=1')
  assert.match(url, /range=1m%26x%3D1$/)
})

test('api: fetchBanners는 먼저 받은 배열을 한 번만 쓰고, 아니면 다시 부른다', async () => {
  let calls = 0
  setGlobal('fetch', async () => { calls++; return { ok: true, json: async () => ['net'] } })
  setGlobal('window', { __bannersEarly: Promise.resolve(['early']) })
  assert.deepEqual(await api.fetchBanners(), ['early'])
  assert.equal(window.__bannersEarly, null)
  assert.deepEqual(await api.fetchBanners(), ['net'])
  window.__bannersEarly = Promise.resolve(null)
  assert.deepEqual(await api.fetchBanners(), ['net'])
  assert.equal(calls, 2)
  delete globalThis.window
})

test('api: fetchBanners는 응답 모양을 확인하지 않고 그대로 돌려준다(EventBanner url 검사 지적의 근원)', async () => {
  setGlobal('fetch', async () => ({ ok: true, json: async () => [{ id: 1 }, { url: 5 }] }))
  assert.deepEqual(await api.fetchBanners(), [{ id: 1 }, { url: 5 }])
})

test('api: fetchBrands, fetchSurveyStatus는 실패 상태에 던진다', async () => {
  setGlobal('fetch', async () => ({ ok: false, status: 503 }))
  await assert.rejects(api.fetchBrands(), /API 503/)
  await assert.rejects(api.fetchSurveyStatus('v_1'), /API 503/)
})

// ---- telemetry: watchAppOpen ----
test('telemetry: 감시 중 두 번째 watchAppOpen은 무시된다(onDone 한 번)', async () => {
  const listeners = {}
  setGlobal('window', {
    addEventListener: (t, f) => { listeners[t] = f },
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 360,
    innerHeight: 800,
  })
  setGlobal('document', { visibilityState: 'visible' })
  if (typeof navigator === 'undefined') setGlobal('navigator', { userAgent: 'node' })
  const { watchAppOpen } = await import('./telemetry.js')
  const done = []
  watchAppOpen('baemin://x', 10, (opened, props) => done.push([opened, props.platform]))
  watchAppOpen('yogiyolink://x', 10, () => done.push('second'))
  await new Promise((r) => setTimeout(r, 30))
  assert.deepEqual(done, [[false, 'baemin']])
  delete globalThis.window
  delete globalThis.document
})

// ---- DOM/JSX 쪽 지적(node:test로 못 돌린다). 고칠 때 순수 함수로 꺼내 skip을 푼다 ----
test.skip('audit: EventBanner — banner.url이 문자열이 아니면 url.startsWith로 배너 영역이 죽는다(EventBanner.jsx:128)', () => {})
test.skip('audit: EventBanner/OfferChip — API 주소를 허용 스킴 확인 없이 href에 넣는다(javascript: 통과)', () => {})
test.skip('audit: useSurvey — 화면이 다시 보일 때마다 attempts=0으로 되돌려 지수 대기가 무력화된다(useSurvey.js:90)', () => {})
test.skip('audit: prerender — today를 toISOString(UTC)로 잡아 KST 00~09시 빌드가 어제 날짜를 찍는다(prerender.mjs:396)', () => {
  // 고칠 때 날짜 함수를 꺼내 2026-11-26T20:00:00Z → '2026-11-27'을 확인한다.
  const d = new Date('2026-11-26T20:00:00Z')
  assert.equal(d.toISOString().slice(0, 10), '2026-11-27')
})
test.skip('audit: prerender — slugOf가 다른 이름을 같은 slug로 만들면 앞 페이지를 덮는다(prerender.mjs:459)', () => {})
test.skip('audit: prerender — 치환 대상이 없으면 조용히 성공 로그를 낸다(prerender.mjs:401-404)', () => {})
