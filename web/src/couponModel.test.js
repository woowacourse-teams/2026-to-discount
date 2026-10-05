import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOffers, minLabel, formulaOf, badgesOf, channelOf, shortBrandName, conditionTable, nameCutPx, amountText } from './couponModel.js'

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
  assert.deepEqual(badgesOf(x), [{ kind: 'best-fit', text: '최적' }])
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

test('배지 3: 한정은 원문, 시각 꼴만 N시로 줄인다', () => {
  assert.deepEqual(badgesOf(o('baemin', 7000, { firstCome: true, badge: '오전 11시 오픈' })), [{ kind: 'limited', text: '11시' }])
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

test('긴 이름은 별칭에서 가장 짧은 한글 이름으로, 짧으면 그대로', () => {
  const tmp = { name: '토핑몬스터피자TMPPIZZA', searchAliases: ['토핑몬스터피자', '토핑몬스터', '토핑 몬스터 피자', 'tmp pizza'] }
  assert.equal(shortBrandName(tmp), '토핑몬스터')
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
