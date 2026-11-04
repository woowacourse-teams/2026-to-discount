import test from 'node:test'
import assert from 'node:assert/strict'

// 주소 ?from= 유입 경로(#221). 모듈을 매번 새로 읽어 페이지 로드 한 번을 흉내 낸다.
function store(values = new Map()) {
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

let loads = 0
async function load(search, session = store()) {
  setGlobal('location', { search, hostname: 'example.test' })
  setGlobal('sessionStorage', session)
  setGlobal('localStorage', store())
  return import(`./analytics-context.js?load=${++loads}`)
}

test('?from=resume이면 resume', async () => {
  const { getEntryFrom } = await load('?from=resume')
  assert.equal(getEntryFrom(), 'resume')
})

test('허용 모양(소문자, 숫자, -, _, 20자) 밖은 버린다', async () => {
  for (const bad of ['Resume', 'res%20ume', '%EC%9D%B4%EB%A0%A5', 'a.b', 'a'.repeat(21), '']) {
    const { getEntryFrom } = await load(`?from=${bad}`)
    assert.equal(getEntryFrom(), undefined, bad)
  }
  const { getEntryFrom } = await load(`?from=${'a'.repeat(20)}`)
  assert.equal(getEntryFrom(), 'a'.repeat(20))
  const none = await load('')
  assert.equal(none.getEntryFrom(), undefined)
})

test('같은 세션에서는 주소가 바뀌어도 첫 값을 유지한다', async () => {
  const session = store()
  assert.equal((await load('?from=resume', session)).getEntryFrom(), 'resume')
  assert.equal((await load('', session)).getEntryFrom(), 'resume')
  assert.equal((await load('?from=other', session)).getEntryFrom(), 'resume')
})

test('새 세션에서 from 없이 들어오면 값이 없다', async () => {
  assert.equal((await load('?from=resume')).getEntryFrom(), 'resume')
  assert.equal((await load('', store())).getEntryFrom(), undefined)
})

test('sessionStorage가 막혀도 던지지 않고 같은 로드 안에서는 유지한다', async () => {
  const { getEntryFrom } = await load('?from=resume', broken)
  assert.equal(getEntryFrom(), 'resume')
  location.search = ''
  assert.equal(getEntryFrom(), 'resume')
})

test('값 없는 방문의 이벤트에는 entryFrom 키가 없다', async () => {
  await load('')
  setGlobal('location', { search: '', hostname: 'example.test', host: 'example.test', pathname: '/' })
  setGlobal('navigator', { doNotTrack: '0' })
  setGlobal('window', { innerWidth: 360, innerHeight: 800, matchMedia: () => ({ matches: false }) })
  setGlobal('document', { referrer: '' })
  setGlobal('setTimeout', () => 1)
  // analytics.js가 읽는 analytics-context.js는 위 시험들의 ?load= 사본과 다른, 이 로드의 첫 사본이다.
  const { enablePostHogFanout, registerPostHogSink, track } = await import('./analytics.js')
  const events = []
  enablePostHogFanout()
  registerPostHogSink((event) => events.push(event))
  track('category_change', { from: 'menu-bar' })
  assert.equal(events[0].props.from, 'menu-bar')
  assert.equal('entryFrom' in events[0].props, false)
})
