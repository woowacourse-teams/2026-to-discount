import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOffers, minLabel, formulaOf, badgesOf, channelOf, shortBrandName, conditionTable, nameCutPx, amountText, chipsOf, onCard, onDetail, headOrder, CHIP_PLACEMENT, membershipOf, qualifiersOf } from './couponModel.js'

const o = (platform, amount, extra = {}) => ({ platform, amount, certainty: 'exact', kind: 'discount', ...extra })

test('최고가 하나면 best 하나, 나머지는 금액 큰 순', () => {
  const r = splitOffers([o('baemin', 7500), o('coupangeats', 10000), o('ddangyo', 5000)], null)
  assert.deepEqual(r.best.map((x) => x.platform), ['coupangeats'])
  assert.deepEqual(r.rest.map((x) => x.amount), [7500, 5000])
  assert.equal(r.hasBest, true)
})

test('동점 최고는 전부 best, 최소주문 낮은 순, 모르는 값은 뒤로', () => {
  const r = splitOffers([
    o('yogiyo', 5000, { minOrderAmount: 30000 }),
    o('ddangyo', 5000, { minOrderAmount: 21000 }),
    o('baemin', 5000),
  ], null)
  assert.deepEqual(r.best.map((x) => x.platform), ['ddangyo', 'yogiyo', 'baemin'])
  assert.equal(r.rest.length, 0)
})

test('하위는 최대(불확정)를 뒤로 민 뒤 금액 큰 순', () => {
  const r = splitOffers([o('baemin', 9000, { qualifier: '최대' }), o('yogiyo', 10000), o('ddangyo', 3000), o('coupangeats', 5000)], null)
  assert.deepEqual(r.rest.map((x) => x.platform), ['coupangeats', 'ddangyo', 'baemin'])
})

test('견줄 수 없는 오퍼만 있으면 맨 앞 하나를 대표로, hasBest는 false', () => {
  const r = splitOffers([o('baemin', 5000, { soldOut: true }), o('yogiyo', 3000, { soldOut: true })], null)
  assert.equal(r.best.length, 1)
  assert.equal(r.best[0].amount, 5000)
  assert.equal(r.hasBest, false)
})

test('최소주문 표기', () => {
  assert.equal(minLabel(18900), '18,900')
  assert.equal(minLabel(0), '최소주문 없음')
  assert.equal(minLabel(null), null)
  assert.equal(minLabel(undefined), null)
})

test('계산식은 최적이고 식 기호가 있을 때만', () => {
  assert.equal(formulaOf(o('yogiyo', 5250, { qualifier: '최적', conditions: '25,000원 × 5% + 4,000원' })), '25,000원 × 5% + 4,000원')
  assert.equal(formulaOf(o('yogiyo', 5250, { qualifier: '최적', conditions: '첫 주문만' })), null)
  assert.equal(formulaOf(o('baemin', 5000, { conditions: '25,000원 × 5%' })), null)
})

// 명세 4절 표의 행마다 하나
test('배지 1: 최대는 불확정, 랜덤, 특정메뉴', () => {
  assert.deepEqual(badgesOf(o('baemin', 9000, { qualifier: '최대' })), [{ kind: 'qualifier-plain', text: '불확정' }])
  assert.deepEqual(badgesOf(o('baemin', 9000, { qualifier: '랜덤' })), [{ kind: 'qualifier-random', text: '랜덤' }])
  assert.deepEqual(badgesOf(o('baemin', 9000, { qualifier: '특정메뉴' })), [{ kind: 'qualifier-plain', text: '특정메뉴' }])
})

test('배지 1: 최적은 새 카드에서만, 운영 칩은 showBestFit false', () => {
  const x = o('yogiyo', 5000, { qualifier: '최적' })
  assert.deepEqual(badgesOf(x), [{ kind: 'best-fit', text: '중복 할인' }])
  assert.deepEqual(badgesOf(x, { showBestFit: false }), [])
})

test('배지 1: n%할인', () => {
  assert.deepEqual(badgesOf(o('baemin', 3000, { badge: '5%할인' })), [{ kind: 'rate', text: '5%할인' }])
  // 값의 성격 배지가 있으면 비율 할인은 안 낸다(운영 칩과 같다)
  assert.deepEqual(badgesOf(o('baemin', 3000, { badge: '5%할인', qualifier: '최대' })).map((b) => b.kind), ['qualifier-plain'])
})

test('배지 2: 멤버십은 membership이나 전용쿠폰 끝말, 글자는 앱별 이름', () => {
  assert.deepEqual(badgesOf(o('baemin', 7500, { membership: 'baeminClub' })), [{ kind: 'membership', text: '배민클럽' }])
  assert.deepEqual(badgesOf(o('coupangeats', 7500, { membership: 'coupangEats' })), [{ kind: 'membership', text: '쿠팡와우' }])
  assert.deepEqual(badgesOf(o('baemin', 7500, { badge: '배민클럽 전용쿠폰' })), [{ kind: 'membership', text: '배민클럽' }])
  assert.deepEqual(badgesOf(o('baemin', 7500, { membership: 'none' })), [])
})

test('배지 3: 한정은 원문, 시각 꼴만 N시 오픈으로 줄인다', () => {
  assert.deepEqual(badgesOf(o('baemin', 7000, { firstCome: true, badge: '오전 11시 오픈' })), [{ kind: 'limited', text: '11시 오픈' }])
  assert.deepEqual(badgesOf(o('baemin', 7000, { badge: '오늘 17시 선착순' })), [{ kind: 'limited', text: '오늘 17시 선착순' }])
  assert.deepEqual(badgesOf(o('baemin', 7000, { badge: '~9/30' })), [{ kind: 'limited', text: '~9/30' }])
  assert.deepEqual(badgesOf(o('baemin', 7000, { firstCome: true, badge: '오전 11시 오픈' }), { shortTime: false }), [{ kind: 'limited', text: '오전 11시 오픈' }])
})

test('배지 순서는 값의 성격, 멤버십, 한정', () => {
  const b = badgesOf(o('coupangeats', 10000, { qualifier: '랜덤', membership: 'coupangEats', badge: '오전 11시 오픈' }))
  assert.deepEqual(b.map((x) => x.kind), ['qualifier-random', 'membership', 'limited'])
})

test('이름 깎을 크기: 8자까지 0, 한 자마다 0.7px', () => {
  assert.equal(nameCutPx('bhc'), 0)
  assert.equal(nameCutPx('꾸브라꼬숯불치킨'), 0)
  assert.equal(nameCutPx('호식이두마리치킨앤'), 0.7)
  assert.equal(nameCutPx('토핑몬스터피자TMPPIZZA'), 4.9)
})

test('금액 글자: 숫자가 없으면 원문', () => {
  assert.equal(amountText(o('baemin', 11000)), '11,000원')
  assert.equal(amountText({ platform: 'own', amount: null, rawText: '1+1' }), '1+1')
})

test('조건 표: 구간마다 한 줄, 멤버십은 오퍼 값을 이어받아 색 칩으로, 조건 문장은 note, 계산식은 뺀다', () => {
  const x = o('baemin', 7500, { expiresAt: '2026-10-31', conditions: '1일 1회', tiers: [
    { amount: 3000, minOrder: 12000 }, { amount: 7500, minOrder: 25000, membership: 'baeminClub', percent: 5, cap: 9000, channel: '배달', expiresAt: '2026-10-05' }] })
  assert.deepEqual(conditionTable(x), { note: '1일 1회', rows: [
    { amount: '7,500원', extra: '5%, 최대 9,000원', chips: [{ kind: 'channel', text: '배달' }, { kind: 'membership', text: '배민클럽', platform: 'baemin' }, { kind: 'until', text: '~10.05' }], min: '25,000원↑' },
    { amount: '3,000원', extra: '', chips: [], min: '12,000원↑' }] })
  assert.deepEqual(conditionTable(o('baemin', 7500, { tiers: [{ amount: 7500, minOrder: 18000 }] })), { rows: [], note: '' })
  assert.deepEqual(conditionTable(o('yogiyo', 5250, { qualifier: '최적', conditions: '25,000원 × 5% + 4,000원' })), { rows: [], note: '' })
  // 구간 없는 멤버십 오퍼도 표가 선다(멤버십이 오퍼 전체에만 있던 경우)
  const m = conditionTable(o('coupangeats', 7000, { membership: 'coupangEats', minOrderAmount: 18000 }))
  assert.deepEqual(m.rows, [{ amount: '7,000원', extra: '', chips: [{ kind: 'membership', text: '쿠팡와우', platform: 'coupangeats' }], min: '18,000원↑' }])
  // 구간이 있어도 구간에 멤버십이 없으면 오퍼 값을 이어받는다
  assert.equal(conditionTable(o('baemin', 7000, { membership: 'baeminClub', tiers: [{ amount: 7000, minOrder: 1 }] })).rows[0].chips[0].text, '배민클럽')
})

test('조건 표: 구간이 자기 멤버십을 밝히면 밝히지 않은 구간은 오퍼 멤버십을 물려받지 않는다', () => {
  // 선착순(멤버십 모름, 소진) + 상시(배민클럽 전용)를 합친 오퍼. 오퍼 값은 배민클럽이다
  const x = o('baemin', 3000, { membership: 'baeminClub', tiers: [{ amount: 6500, soldOut: true, note: '선착순' }, { amount: 3000, membership: 'baeminClub' }] })
  const rows = conditionTable(x).rows
  assert.deepEqual(rows[0].chips.map((c) => c.kind), ['note'])
  assert.deepEqual(rows[1].chips.map((c) => c.kind), ['membership'])
})

test('조건 표: 선착순 구간 메모는 여는 시각과 나머지를 칩 둘로 가른다', () => {
  const x = o('baemin', 5000, { tiers: [{ amount: 5000, note: '오전 10시 오픈 선착순' }, { amount: 3000, minOrder: 20000 }] })
  assert.deepEqual(conditionTable(x).rows[0].chips, [{ kind: 'note', text: '오전 10시 오픈' }, { kind: 'note', text: '선착순' }])
  const y = o('baemin', 5000, { tiers: [{ amount: 5000, note: '사용(발급X) 선착순' }, { amount: 3000 }] })
  assert.deepEqual(conditionTable(y).rows[0].chips, [{ kind: 'note', text: '사용(발급X) 선착순' }])
})

test('긴 이름은 별칭에서 가장 짧은 한글 이름으로, 짧으면 그대로', () => {
  const tmp = { name: '토핑몬스터피자TMPPIZZA', searchAliases: ['토핑몬스터피자', '토핑몬스터', '토핑 몬스터 피자', 'tmp pizza'] }
  assert.equal(shortBrandName(tmp), '토핑몬스터')
  assert.equal(shortBrandName({ ...tmp, shortName: '토핑몬스터피자' }), '토핑몬스터피자')
  assert.equal(shortBrandName({ name: '청년피자', searchAliases: ['청피'] }), '청년피자')
  assert.equal(shortBrandName({ name: '아주아주긴이름의브랜드명입니다', searchAliases: [] }), '아주아주긴이름의브랜드명입니다')
})

test('이름 깎을 크기: 8자까지 0, 한 자마다 0.7px', () => {
  assert.equal(nameCutPx('bhc'), 0)
  assert.equal(nameCutPx('꾸브라꼬숯불치킨'), 0)
  assert.equal(nameCutPx('호식이두마리치킨앤'), 0.7)
  assert.equal(nameCutPx('토핑몬스터피자TMPPIZZA'), 4.9)
})

test('금액 글자: 숫자가 없으면 원문', () => {
  assert.equal(amountText(o('baemin', 11000)), '11,000원')
  assert.equal(amountText({ platform: 'own', amount: null, rawText: '1+1' }), '1+1')
})

test('이름 깎을 크기: 8자까지 0, 한 자마다 0.7px', () => {
  assert.equal(nameCutPx('bhc'), 0)
  assert.equal(nameCutPx('꾸브라꼬숯불치킨'), 0)
  assert.equal(nameCutPx('호식이두마리치킨앤'), 0.7)
  assert.equal(nameCutPx('토핑몬스터피자TMPPIZZA'), 4.9)
})

test('금액 글자: 숫자가 없으면 원문', () => {
  assert.equal(amountText(o('baemin', 11000)), '11,000원')
  assert.equal(amountText({ platform: 'own', amount: null, rawText: '1+1' }), '1+1')
})


test('채널 칩: 같은 금액 구간의 채널, 없으면 badge, 모르면 null', () => {
  assert.equal(channelOf(o('baemin', 7000, { tiers: [{ amount: 7000, channel: '포장' }, { amount: 3000, channel: '배달' }] })), '포장')
  assert.equal(channelOf(o('baemin', 7000, { badge: '배달 전용' })), '배달')
  assert.equal(channelOf(o('baemin', 7000)), null)
})

test('업데이트: 오늘(한국 시각) 처음 본 오퍼만', async () => {
  const { isUpdated } = await import('./couponModel.js')
  const now = Date.parse('2026-10-05T00:30:00+09:00')
  assert.equal(isUpdated({ firstSeenAt: '2026-10-05T00:01:00+09:00' }, now), true)
  assert.equal(isUpdated({ firstSeenAt: '2026-10-04T23:59:00+09:00' }, now), false)
  assert.equal(isUpdated({ firstSeenAt: null }, now), false)
  assert.equal(isUpdated({}, now), false)
})

test('최적 상세 표: 겹친 구간에 계산식, 최소주문 모르면 미확인', () => {
  const offer = { platform: 'yogiyo', amount: 7000, qualifier: '최적', conditions: '30,000원↑ 5,000+2,000=7,000원',
    tiers: [{ minOrder: 21000, amount: 5000 }, { minOrder: 30000, amount: 7000, channel: '배달' }, { minOrder: null, amount: 7000, channel: '포장' }] }
  const { rows } = conditionTable(offer)
  assert.equal(rows[0].extra, '5,000+2,000')
  assert.equal(rows[1].min, '최소주문 미확인')
  assert.equal(rows[2].extra, '')
})

test('요기요 정률 배달 + 정액 포장 합계 구간: 포장은 계산식, 배달은 정률 표기(tracker RULE-AUDIT 7번)', () => {
  const x = o('yogiyo', 9000, { qualifier: '최적', minOrderAmount: 20000, expiresAt: '2026-10-04', conditions: '포장 20,000원↑ 7,000+2,000=9,000원',
    tiers: [{ minOrder: 19000, amount: 7000 }, { minOrder: 25000, amount: 8250, percent: 5, cap: 10000, channel: '배달', expiresAt: '2026-10-04' },
      { minOrder: 20000, amount: 9000, channel: '포장', expiresAt: '2026-10-04' }] })
  assert.equal(formulaOf(x), '포장 20,000원↑ 7,000+2,000=9,000원')
  assert.deepEqual(conditionTable(x).rows.map((r) => [r.amount, r.extra, r.chips.map((c) => c.text).join(), r.min]), [
    ['9,000원', '7,000+2,000', '포장', '20,000원↑'],
    ['8,250원', '5%, 최대 10,000원', '배달', '25,000원↑'],
    ['7,000원', '', '', '19,000원↑'],
  ])
})

test('1+1 묶음 행사는 대표, 하위와 따로 맨 위 줄로 간다(2026-10-11)', () => {
  const bundle = { platform: 'own', amount: null, rawText: '징거버거 1+1', kind: 'bundle' }
  const a = o('baemin', 3000)
  const b = o('coupangeats', 2000)
  const { best, rest, bundles } = splitOffers([a, b, bundle], {})
  assert.equal(best[0], a)
  assert.deepEqual(rest, [b])
  assert.deepEqual(bundles, [bundle])
})

test('new offer is the first card among tied best offers', () => {
  const offers = [{ platform: 'baemin', amount: 5000, minOrderAmount: 10000, isNew: false },
    { platform: 'yogiyo', amount: 5000, minOrderAmount: 20000, isNew: true }]
  assert.deepEqual(splitOffers(offers).best.map((o) => o.platform), ['yogiyo', 'baemin'])
})

// #151 카드와 상세가 한 목록(chipsOf)에서 뽑는다. 합성 픽스처, 형태만 이슈의 CU, 푸라닭과 같다(ADR-009).
const puradak = [
  o('yogiyo', 6000, { qualifier: '최적', conditions: '30,000원↑ 4,000+2,000=6,000원', tiers: [{ amount: 4000 }, { amount: 6000, channel: '포장' }] }),
  o('coupangeats', 7000, { membership: 'coupangEats' }),
  o('ddangyo', 5000),
]
const cuNew = o('coupangeats', 7000, { conditions: '첫 주문', qualifiers: ['첫 주문'] })
const cuOld = o('coupangeats', 7000, { conditions: '첫 주문' })
const key = (c) => `${c.kind}:${c.text}`

test('#151 표시 위치 표: CHIP_PLACEMENT가 설계 문서 표와 같다', () => {
  const H = 'head'
  assert.deepEqual(CHIP_PLACEMENT, {
    'qualifier-plain': { card: H, detail: H }, 'qualifier-random': { card: H, detail: H }, 'best-fit': { card: false, detail: H },
    rate: { card: H, detail: H }, membership: { card: H, detail: H }, limited: { card: H, detail: H }, condition: { card: H, detail: H },
    channel: { card: H, detail: H }, note: { card: false, detail: 'row' }, until: { card: false, detail: 'row' },
  })
})

test('#151 같은 목록: 카드 칩은 모두 상세에 있고, 모든 칩 kind가 표에 있다', () => {
  for (const x of [...puradak, cuNew, cuOld]) {
    const all = chipsOf(x)
    for (const c of all) assert.ok(CHIP_PLACEMENT[c.kind], c.kind)
    const detail = new Set(all.filter(onDetail).map(key))
    for (const c of all.filter(onCard)) assert.ok(detail.has(key(c)), key(c))
  }
})

test('#151 CU: 첫 주문은 칩 하나, 상세 문장에서 빠진다. 옛 응답도 같고 부분 일치는 문장으로 둔다', () => {
  for (const x of [cuNew, cuOld]) {
    assert.deepEqual(chipsOf(x).filter(onCard).map(key), ['condition:첫 주문'])
    assert.equal(conditionTable(x).note, '')
  }
  const only = o('coupangeats', 7000, { conditions: '첫 주문만 가능' })
  assert.deepEqual(qualifiersOf(only), [])
  assert.equal(conditionTable(only).note, '첫 주문만 가능')
})

test('#151 푸라닭: 요기요 중복 할인은 상세 머리에만, 카드와 표 줄에는 안 뜬다', () => {
  const c = chipsOf(puradak[0])
  assert.deepEqual(c.filter(onCard).map(key), ['channel:포장'])
  assert.deepEqual(c.filter((x) => x.scope === 'offer' && onDetail(x)).map(key), ['channel:포장', 'best-fit:중복 할인'])
  assert.ok(!c.some((x) => x.scope === 'tier' && x.kind === 'best-fit'))
  assert.deepEqual(chipsOf(puradak[1]).filter(onCard).map(key), ['membership:쿠팡와우'])
  assert.deepEqual(chipsOf(puradak[2]), [])
})

test('#151 멤버십: 카드는 대표 구간의 membershipOf를 따른다', () => {
  const mem = (x) => chipsOf(x).filter(onCard).some((c) => c.kind === 'membership')
  const tiers = [{ amount: 6500, note: '선착순' }, { amount: 3000, membership: 'baeminClub' }]
  assert.equal(mem(o('baemin', 6500, { membership: 'baeminClub', tiers })), false) // 대표가 비멤버 구간
  assert.equal(mem(o('baemin', 3000, { tiers })), true) // 대표가 멤버 구간(오퍼 값 없음)
  assert.equal(mem(o('baemin', 3000, { membership: 'baeminClub' })), true) // 구간 없음: 오퍼 값
  assert.equal(mem(o('baemin', 3000, { badge: '배민클럽 전용쿠폰' })), true) // 옛 행
  assert.equal(membershipOf(o('baemin', 3000, { badge: '배민클럽 전용쿠폰' })), 'badge')
})

test('#151 머리 줄 순서: 채널, 멤버십, 선착순(한정), 나머지, 복합은 맨 뒤', () => {
  const k = (...kinds) => kinds.map((kind) => ({ kind }))
  assert.deepEqual(headOrder(k('best-fit', 'condition', 'limited', 'membership', 'channel', 'qualifier-plain')).map((c) => c.kind),
    ['channel', 'membership', 'limited', 'condition', 'qualifier-plain', 'best-fit'])
})
