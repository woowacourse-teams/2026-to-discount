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
    id: 'platform',
    title: '주로 어떤 앱으로 시키시나요?',
    options: [
      { token: 'baemin', label: '배달의민족' },
      { token: 'coupangeats', label: '쿠팡이츠' },
      { token: 'yogiyo', label: '요기요' },
      { token: 'ddangyo', label: '땡겨요' },
      { token: 'mixed', label: '그때그때 다르다' },
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
      { token: 'nothing', label: '딱히 없다' },
    ],
  },
]

/** 첫 섹션. 서버가 검증하는 토큰이 여기서 나온다. */
export const PRIMARY = SECTIONS.find((s) => s.primary) ?? SECTIONS[0]
