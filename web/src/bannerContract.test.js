// 배너 계약(API 저장소 contracts/banner-cases.json)의 응답 예시를 웹이 그대로 소비하는지 본다.
//
// API의 BannerContractTest가 같은 파일의 yml 예시를 파싱하고 직렬화해 이 응답과 글자까지
// 같은지 본다. 여기서는 그 응답을 웹 코드에 넣는다. 둘이 한 파일을 보므로 응답 칸 이름이
// 바뀌면 한쪽만 초록일 수 없다(감사 2026-09-29: API JSON과 웹 사이에 테스트가 없었다).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { apiFile } from '../scripts/api-repo.mjs'
import { bannerTag } from './bannerTag.js'
import { bannerMemberLabels, memberText } from './bannerMembers.js'

const contract = JSON.parse(readFileSync(
  apiFile('src', 'test', 'resources', 'contracts', 'banner-cases.json'), 'utf8'))

const responses = contract.cases.flatMap((c) => c.response.map((item) => ({ c, item })))

test('계약 응답이 셋 이상이다 - 빈 계약으로 초록이 되지 않는다', () => {
  assert.ok(responses.length >= 3)
})

test('응답마다 계약의 칸이 전부 있다', () => {
  for (const { c, item } of responses) {
    assert.deepEqual(Object.keys(item).sort(), [...contract.responseKeys].sort(), c.name)
  }
})

test('표식은 계약이 말한 대로다', () => {
  for (const { c, item } of responses) {
    const want = c.tags[item.id] ?? null
    assert.equal(bannerTag(item)?.kind ?? null, want, `${c.name}: ${item.id}`)
  }
})

test('묶음 카드는 구성원마다 소진을 따로 그린다', () => {
  const card = contract.cases.find((c) => c.name === 'ce-event-group').response[0]
  assert.equal(card.soldOut, false, '한 곳만 소진이면 카드는 소진이 아니다')
  assert.deepEqual(bannerMemberLabels(card).map(({ label, soldOut }) => ({ label, soldOut })), [
    { label: '청년피자', soldOut: false },
    { label: '60계치킨', soldOut: true },
  ])
})

test('묶음 카드는 구성원 줄엔 이름만, 금액·최소주문은 제 줄에(2026-10-01 사용자)', () => {
  const card = contract.cases.find((c) => c.name === 'ce-event-group').response[0]
  const members = bannerMemberLabels(card)
  assert.deepEqual(members.map(memberText), ['청년피자', '60계치킨'])
  assert.ok(!('url' in card.members[0]), '구성원에는 링크가 없다. 링크는 카드 하나다')
  assert.equal(memberText({ label: '두찜', amount: '7,000원', minOrder: 18000 }), '두찜', '금액은 금액 줄, 최소주문은 세 번째 줄(2026-10-01)')
})

test('규칙을 어긴 묶음은 접히지 않은 카드로 온다', () => {
  const items = contract.cases.find((c) => c.name === 'group-rule-broken').response
  assert.equal(items.length, 2)
  for (const item of items) assert.equal(item.members, null)
})

test('데일리 슈퍼딜은 최대 N원으로 온다', () => {
  const item = contract.cases.find((c) => c.name === 'superdeal-capped').response[0]
  assert.equal(item.amount, '최대 10,000원')
  assert.deepEqual([item.amountSpec.wonMin, item.amountSpec.wonMax], [null, 10000])
})

test('웹이 읽는 배너 칸은 계약의 consumers.web과 같고 전부 응답에 있다', () => {
  // 소스에서 banner.X를 모은다. 주석 속 이름은 뺀다(bannerTag.js 머리말이 period를 말한다).
  const files = ['EventBanner.jsx', 'bannerTag.js', 'bannerMembers.js', 'App.jsx', 'OfferChip.jsx']
  const read = new Set()
  for (const f of files) {
    const code = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    for (const m of code.matchAll(/\bbanner\??\.([a-zA-Z]+)/g)) read.add(m[1])
  }
  assert.deepEqual([...read].sort(), [...contract.consumers.web].sort(),
    '웹이 읽는 칸이 바뀌었으면 계약의 consumers.web을 같이 고친다')
  for (const key of read) assert.ok(contract.responseKeys.includes(key), `응답에 없는 칸을 읽는다: ${key}`)
})
