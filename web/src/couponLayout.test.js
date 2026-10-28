import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const script = readFileSync(new URL('../scripts/dev/layout-check.js', import.meta.url), 'utf8')
const rect = (left, width, top = 100) => ({ left, right: left + width, width, top, bottom: top + 20, height: 20 })
const textNode = (textContent, bounds) => ({ nodeType: 3, textContent, bounds })

// 브라우저가 반환한 좌표를 경계에서 대체한다. 실제 iOS 렌더링은 ios-shot이 검증한다.
async function measure({ digits = rect(10, 80), unit = rect(91, 40), minimum = rect(10, 100), soldOut = false, empty = false, expected = false } = {}) {
  const timers = []
  const reports = []
  const brand = { dataset: { brand: '던킨' }, getBoundingClientRect: () => rect(0, 390) }
  const ticket = { getBoundingClientRect: () => rect(0, 350) }
  const digitText = textNode('6,000', digits)
  const minText = textNode('최소주문 18,000원', minimum)
  const suffix = { bounds: unit, textContent: '원 할인' }
  const struck = { childNodes: [digitText, suffix] }
  const min = {
    childNodes: [minText],
    closest: (selector) => selector === '.cc-ticket' ? ticket : brand,
  }
  const amount = {
    childNodes: soldOut ? [struck] : [digitText, suffix],
    querySelector: (selector) => selector === 'small' ? suffix : selector === 's' && soldOut ? struck : null,
    closest: (selector) => selector === '.cc-ticket' ? ticket : selector === '[data-brand]' ? brand : null,
  }
  const document = {
    head: { appendChild() {} }, body: { appendChild() {}, querySelectorAll: () => [] },
    documentElement: { scrollWidth: 390 }, styleSheets: [], fonts: { status: 'loaded' },
    createElement: () => ({ style: {} }),
    createRange: () => {
      let selected
      return { selectNodeContents(node) { selected = node }, getBoundingClientRect: () => selected.bounds }
    },
    querySelector: (selector) => selector === '.brand-grid' ? { getBoundingClientRect: () => rect(0, 390) } : selector === 'article[data-brand]' ? brand : null,
    querySelectorAll: (selector) => {
      if (selector === '.cc-amt') return empty ? [] : [amount]
      if (selector === '.cc-min') return empty ? [] : [min]
      if (selector === 'article[data-brand]') return [brand]
      return []
    },
  }
  vm.runInNewContext(script, {
    document, location: { search: expected ? '?expect=coupon-text' : '', href: 'http://localhost:5173/' },
    URLSearchParams, innerWidth: 390, innerHeight: 844, window: {}, navigator: { userAgent: 'test' },
    setTimeout(callback) { timers.push(callback) },
    fetch(url, options) { reports.push(JSON.parse(options.body)); return Promise.resolve() },
  })
  while (timers.length) await timers.shift()()
  assert.equal(reports.length, 1, 'CI 수신기로 검사 결과가 전달돼야 한다')
  return reports[0]
}

test('쿠폰 금액과 단위가 분리되고 최소주문 폭이 있으면 통과한다', async () => {
  assert.equal((await measure()).fails.length, 0)
})

test('금액과 단위의 실제 영역이 겹치면 실패한다', async () => {
  assert.match((await measure({ unit: rect(50, 40) })).fails.join('\n'), /겹친다/)
})

for (const [field, label, error] of [
  ['unit', '단위', /단위.*폭.*0/],
  ['digits', '금액', /금액.*폭.*0/],
  ['minimum', '최소주문', /최소주문.*폭.*0/],
]) {
  test(`${label} 글자의 폭이 0이면 실패한다`, async () => {
    const result = await measure({ [field]: rect(10, 0) })
    assert.match(result.fails.join('\n'), error)
  })
}

test('품절 금액의 취소선 안에 있는 글자도 검사한다', async () => {
  assert.match((await measure({ soldOut: true, digits: rect(10, 0) })).fails.join('\n'), /금액.*폭.*0/)
})

test('쿠폰 글자 검증 장면에 검사할 쿠폰이 없으면 실패한다', async () => {
  assert.match((await measure({ empty: true, expected: true })).fails.join('\n'), /쿠폰.*없/)
})
