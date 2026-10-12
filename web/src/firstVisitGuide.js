// 첫 방문 안내(2026-10-12). 처음 온 사람에게 첫 화면의 네 자리를 차례로 짚어 준다.
// 띄우는 조건과 단계 목록만 여기 둔다. 화면(FirstVisitGuide.jsx)은 단계마다 selector로 자리를 찾고,
// 못 찾은 단계는 건너뛴다. 메인 화면 A/B(homeExperiment.js)의 두 안은 바가 달라 단계도 갈린다.
const SEEN_KEY = 'dk_guide_seen'

// 첫 세션(dk_visits 1)이고, 본 적 없고, 첫 화면('/')일 때만. 브랜드 주소로 들어온 사람은 찾는 게 이미 있다.
// ?guide=1이면 조건을 무시하고 띄운다(프리뷰 확인용).
export function shouldShowGuide({ visitCount, pathname, search }, storage = globalThis.localStorage) {
  if (new URLSearchParams(search).get('guide') === '1') return true
  if (pathname !== '/' || visitCount > 1) return false
  try { return storage.getItem(SEEN_KEY) !== '1' } catch { return false } // 저장소가 막히면 매번 뜨게 되니 안 띄운다
}

export function markGuideSeen(storage = globalThis.localStorage) {
  try { storage.setItem(SEEN_KEY, '1') } catch { /* 못 적으면 다음 세션은 visitCount가 막는다 */ }
}

const CARD = { key: 'card', selector: '.brand-grid > :first-child', text: '브랜드마다 지금 받을 수 있는 가장 큰 할인을 모았어요. 누르면 그 앱으로 바로 가요.' }
const SORT = { key: 'sort', selector: '.quick-bar', text: '할인금액 높은순, 최소주문 낮은순으로 바로 줄 세울 수 있어요.' }

// old = 운영 바(TopBarA: 검색 아이콘 + 분류 줄), coupon = TopBarB(검색창 + 필터 시트)
export function guideSteps(arm) {
  return arm === 'coupon'
    ? [CARD, SORT,
      { key: 'filter', selector: '[aria-label="필터 열기"]', text: '앱, 분류, 정렬은 여기서 한 번에 골라요.' },
      { key: 'search', selector: '.search-field', text: '찾는 브랜드가 있으면 검색하세요.' }]
    : [CARD, SORT,
      { key: 'category', selector: '.cat-bar', text: '분류를 눌러 먹고 싶은 것만 볼 수 있어요.' },
      { key: 'search', selector: '.search-control', text: '오른쪽 위 돋보기를 누르면 브랜드를 찾을 수 있어요.' }]
}
