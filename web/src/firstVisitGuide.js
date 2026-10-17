// 첫 방문 안내(2026-10-12). 처음 온 사람에게 첫 화면의 네 자리를 차례로 짚어 준다.
// 띄우는 조건과 단계 목록만 여기 둔다. 화면(FirstVisitGuide.jsx)은 단계마다 selector로 자리를 찾고,
// 못 찾은 단계는 건너뛴다. 메인 화면 A/B(homeExperiment.js)의 두 안은 바가 달라 단계도 갈린다.
const SEEN_KEY = 'dk_guide_seen'

// 첫 세션(dk_visits 1)이고, 본 적 없고, 첫 화면('/')일 때만. 브랜드 주소로 들어온 사람은 찾는 게 이미 있다.
// ?guide=1이면 조건을 무시하고 띄운다(프리뷰 확인용).
/**
 * 2026-10-14부터 주소에 ?guide=1이 있을 때만 띄운다. 첫 방문 자동 노출은 신규 첫 세션 전환을
 * 절반으로 깎아(docs/metrics/HOME-AB-20261014.md 상세 3) 뺐다. 보여 줘야 할 때 주소로 연다.
 */
export function shouldShowGuide({ search }) {
  return new URLSearchParams(search).get('guide') === '1'
}

export function markGuideSeen(storage = globalThis.localStorage) {
  try { storage.setItem(SEEN_KEY, '1') } catch { /* 못 적으면 다음 세션은 visitCount가 막는다 */ }
}

// 문구는 2026-10-13 사용자가 정했다
// 카드 단계는 '버튼'을 따로 테두리로 짚는다. 운영 카드는 최고 오퍼 칩, 쿠폰 카드는 쿠폰 모양 그대로.
// 자세히 보기는 본문 언급 없이 테두리와 짧은 표시만(2026-10-13 사용자).
const CARD_TEXT = '브랜드마다 지금 받을 수 있는 가장 큰 할인을 모았어요. 버튼을 누르면 그 앱으로 바로 이동해요.'
const DETAIL = '상세 정보도 있어요!'
// side: 표시를 테두리 어느 쪽 위에 붙이나. 카드의 기존 표(최고, 신규 할인)와 화면 가장자리를 피한다.
const card = (button, buttonSide, detail, detailSide) => ({ key: 'card', selector: '.brand-grid > :first-child', text: CARD_TEXT, em: '버튼',
  marks: [{ selector: button, label: '버튼', side: buttonSide }, { selector: detail, label: DETAIL, side: detailSide }] })
const SORT = { key: 'sort', selector: '.quick-bar', text: '할인금액 높은순, 최소주문 낮은순으로 빠르게 모아 볼 수 있어요.' }
const CATEGORY = '카테고리를 선택해 모아 볼 수 있어요.'

// 상단 바(TopBarB: 검색창 + 분류 메뉴 + 필터 시트)와 쿠폰 카드 기준. 운영 카드 안은 2026-10-17에 지웠다.
export function guideSteps() {
  return [card('.brand-grid > :first-child .cc-ticket', 'left', '.brand-grid > :first-child .cc-hint', 'right'), SORT,
    { key: 'category', selector: '.menu-bar', text: CATEGORY },
    { key: 'search', selector: '.search-field', text: '브랜드를 검색할 수 있어요.' },
    { key: 'filter', selector: '[aria-label="필터 열기"]', text: '필터 페이지에서 원하는 조건을 선택할 수 있어요.' }]
}
