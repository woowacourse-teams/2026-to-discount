// 묶음 구성원 한 줄. 쿠팡이츠 하루치 선착순 묶음(2026-09-30)은 구성원마다 여는 시각이 앞에 붙는다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { bannerMemberLabels, memberMinOrderText, memberText, openHourText } from './bannerMembers.js'

test('이름 줄은 여는 시각과 이름만 — 금액·최소주문은 다른 줄(2026-10-01)', () => {
  const card = {
    members: [
      { brand: '뚜레쥬르', brandLabel: '뚜레쥬르', amount: '최대 6,000원', minOrder: null, soldOut: false, opensAt: '09:00' },
      { brand: 'bhc', brandLabel: 'BHC', amount: '8,000원', minOrder: 18000, soldOut: false, opensAt: '11:30' },
    ],
  }
  assert.deepEqual(bannerMemberLabels(card).map(memberText),
    ['9시 뚜레쥬르', '11시 30분 BHC'])
})

test('여는 시각이 없으면 예전 글자 그대로', () => {
  const card = { members: [
    { brand: 'a', brandLabel: '청년피자', amount: '최대 10,000원', minOrder: null, soldOut: false },
    { brand: 'b', brandLabel: '60계치킨', amount: null, minOrder: null, soldOut: true, opensAt: null },
  ] }
  assert.deepEqual(bannerMemberLabels(card).map(memberText), ['청년피자', '60계치킨'])
})

test('시각을 못 읽으면 뺀다', () => {
  assert.equal(openHourText('17:00'), '17시')
  assert.equal(openHourText(null), null)
  assert.equal(openHourText('저녁'), null)
})

test('최소주문은 세 번째 줄에: 같으면 한 번, 다르면 브랜드별, 모르면 없음', () => {
  assert.equal(memberMinOrderText([{ label: 'A', minOrder: 18000 }, { label: 'B', minOrder: 18000 }]), '18,000원 이상 주문 시')
  assert.equal(memberMinOrderText([{ label: 'BHC', minOrder: 18000 }, { label: '뚜레쥬르', minOrder: null }]), 'BHC 18,000원↑')
  assert.equal(memberMinOrderText([{ label: 'A', minOrder: 15000 }, { label: 'B', minOrder: 18000 }]), 'A 15,000원↑ · B 18,000원↑')
  assert.equal(memberMinOrderText([{ label: 'A', minOrder: null }]), null)
})
