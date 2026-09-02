/**
 * 설문 문항. 이 파일만 고치면 화면이 바뀐다.
 *
 * 수정·반영 방법은 docs/survey-questions.md 참고.
 *
 * ## 규칙
 *
 * - `token`은 원장에 그대로 들어간다. 한 번 쓴 토큰을 바꾸면 이전 응답과
 *   못 합친다 — 문구(`label`)만 고치는 것은 안전하고, 토큰을 바꾸는 것은
 *   집계를 끊는 일이다.
 * - 첫 섹션(`primary: true`)의 토큰만 서버가 검증한다
 *   (SurveyService.CHOICES). 여기 토큰을 늘리려면 서버도 같이 고쳐야 한다.
 *   나머지 섹션은 서버가 값을 그대로 받아 적으므로 자유롭게 늘려도 된다.
 * - `other: true`면 "직접 입력" 칸이 붙는다. 자유 입력은 서버가 주민번호·
 *   이메일·전화번호를 지우고 200자로 잘라 원장에만 남긴다(PostHog엔 안 간다).
 */

/** 카드 머리에 붙는 띠. 지급 조건이 바뀌면 이 줄만 고친다. */
export const REWARD_NOTICE = '응답해 주시면 배민 1,000원 쿠폰 지급'

// 무엇을 물을지 고르는 기준: 우리가 이미 가진 데이터(클릭·링크 이동으로
// 보이는 주 이용 플랫폼 등)는 안 묻는다 — 물어봤자 로그로 이미 아는 걸
// 한 번 더 확인하는 것뿐이다. 직접 답을 듣지 않고는 알 길이 없는 것만
// 남긴다(쓰는 이유·시점, 뭘 중시하는지, 뭘 바라는지). "딱히 없다"류
// 선택지도 뺐다 — 정보값이 없는 답을 고르라고 자리 하나를 내주는
// 셈이라 다른 진짜 답의 응답률만 깎는다.
export const SECTIONS = [
  {
    id: 'purpose',
    primary: true,
    title: '이 서비스를 어디에 쓰시나요?',
    other: true,
    options: [
      { token: 'new+discount_info', label: '새로운 할인 확인' },
      { token: 'save_money', label: '제일 싼 할인 찾기' },
      { token: 'compare', label: '배달앱 할인 비교' },
      { token: 'function', label: '%할인 등 귀찮은 쿠폰 처리' },
    ],
  },
  {
    // 목적(purpose)만으로는 안 잡히는 시점을 묻는다 — "왜 쓰는지"와
    // "언제 켜는지"는 다른 신호다. 뭘 먹을지부터 못 정한 사람과, 이미
    // 정하고 최고가만 찾는 사람은 화면에서 원하는 게 다르다.
    id: 'when',
    title: '주로 언제 쓰시나요?',
    other: true,
    options: [
      { token: 'undecided', label: '뭐 먹을지 못 정했을 때' },
      { token: 'best_deal', label: '가장 큰 할인을 찾을 때' },
      { token: 'find_else', label: '할인이 마음에 안들 때' },
      { token: 'weekly', label: '매주/매일 주기적으로' },
    ],
  },
  {
    id: 'priority',
    title: '가장 중요하다 생각하는 정보는?',
    other: true,
    options: [
      { token: 'amount', label: '할인 금액' },
      { token: 'condition', label: '조건(최소주문금액 등)' },
      { token: 'limited', label: '선착순·한정수량 여부' },
      { token: 'platform', label: '어느 배달 앱인지' },
    ],
  },
  {
    id: 'missing',
    title: '가장 아쉬운 점은 무엇인가요?',
    other: true,
    options: [
      { token: 'few_brands', label: '브랜드가 적다' },
      { token: 'stale', label: '이미 끝난 할인이 그대로 남아있다' },
      { token: 'hard_to_find', label: '원하는 걸 찾기 어렵다' },
      { token: 'bad_discount', label: '할인이 짜다, 마음에 안든다' },
    ],
  },
  {
    // 만들 수 있거나 이미 신호가 잡힌 것만 넣는다 — 답을 받아도 어차피
    // 못 만들 것을 물으면 기대만 심고 못 지킨다.
    id: 'wish',
    title: '앞으로 있었으면 하는 기능이 있다면?',
    other: true,
    options: [
      { token: 'discount_alert', label: '새 할인 알림' },
      { token: 'membership', label: '멤버십 쿠폰 필터링' },
      { token: 'region_filter', label: '주변 가게만 보기' },
      { token: 'discount_history', label: '지난 할인 기록 보기' },
    ],
  },
]

/** 첫 섹션. 서버가 검증하는 토큰이 여기서 나온다. */
export const PRIMARY = SECTIONS.find((s) => s.primary) ?? SECTIONS[0]
