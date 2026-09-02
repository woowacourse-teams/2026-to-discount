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
    title: '이 서비스를 왜 쓰시나요?',
    other: true,
    options: [
      { token: 'discount_info', label: '할인 정보 보려고' },
      { token: 'save_money', label: '배달비 아끼려고' },
      { token: 'compare', label: '앱끼리 비교하려고' },
    ],
  },
  {
    id: 'when',
    title: '주로 언제 쓰시나요?',
    other: true,
    options: [
      { token: 'before_app', label: '배달 앱 켜기 전에 미리' },
      { token: 'already_decided', label: '먹을 걸 정해두고 쿠폰만 확인' },
      { token: 'comparing', label: '여러 앱 가격 비교하면서' },
    ],
  },
  {
    id: 'priority',
    title: '카드에서 제일 먼저 보시는 건요?',
    other: true,
    options: [
      { token: 'amount', label: '할인 금액' },
      { token: 'min_order', label: '최소주문금액' },
      { token: 'expiry', label: '남은 기간' },
      { token: 'cheapest_app', label: '어느 앱이 제일 싼지' },
    ],
  },
  {
    id: 'missing',
    title: '가장 아쉬운 점은 무엇인가요?',
    other: true,
    options: [
      { token: 'few_brands', label: '브랜드가 적다' },
      { token: 'stale', label: '정보가 낡았다' },
      { token: 'hard_to_find', label: '원하는 걸 찾기 어렵다' },
    ],
  },
  {
    id: 'wish',
    title: '다음에 생기면 좋겠는 기능은요?',
    other: true,
    options: [
      { token: 'brand_alert', label: '관심 브랜드 알림' },
      { token: 'favorites', label: '즐겨찾기 저장' },
      { token: 'region_filter', label: '지역별 필터' },
      { token: 'expiry_alert', label: '할인 만료 임박 알림' },
    ],
  },
]

/** 첫 섹션. 서버가 검증하는 토큰이 여기서 나온다. */
export const PRIMARY = SECTIONS.find((s) => s.primary) ?? SECTIONS[0]
