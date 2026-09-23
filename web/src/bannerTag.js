/**
 * 배너 오른쪽 위에 붙는 표식. 칸에서 바로 나온다.
 *
 * 예전에는 period와 extra 문장에 "선착순"이나 "랜덤"이 있는지 봤다. 서버가 구조 칸으로
 * 만든 문장을 화면이 다시 읽던 자리다(2026-09-18에 없애기로 한 파싱).
 *
 * 구조 금액 칸은 응답에서 amountSpec이다 - api Banner.java의 amountSpec 레코드 칸을
 * 그대로 받는다. amount는 옛 문자열 칸("30% 할인" 같은 화면 문구)이라 여기서는 안 읽는다.
 *
 * 캐시백·적립 둘 다 화면 라벨은 "적립"이다(fix round 2). 2026-09-22 개발자가 백억커피
 * 배너에 "적립"을 요청했고 그 문구가 이미 승인되어 나가 있다(BannerText: case
 * "cashback" -> "적립"). 구분은 데이터에만 남는다 - amountSpec.kind가 cashback/points를
 * 가르고 비교 규칙(filters.js)이 그 값을 쓰지만, 표식 줄은 승인된 단어를 그대로 쓴다.
 *
 * 정률(percent) 그 자체는 여기서 표식으로 안 만든다. 배너 자체(EventBanner.jsx)는
 * 서버가 amountSpec에서 만든 amount 문구("30% 할인")를 금액 자리에 그대로 찍는다.
 * 자사 정률 배너가 브랜드 카드의 오퍼로 설 때는 그 문구가 offer.rawText로 실려
 * offerAmountText(App.jsx)의 폴백 값이 된다 — offer.badge는 banner.period()라
 * `n%할인` 칩(App.jsx의 /^\d+%할인$/ 검사)은 배너에서 온 오퍼와는 안 맞고, headline()이
 * null이라 amount도 비어 rawText로 떨어지는 경로가 실제로 값을 낸다(BrandComparisonService
 * 인자 순서로 확인, OfferRecord.java 칸 순서와 대조). 결과("30% 할인"이 뜬다)는 같지만
 * 지나가는 자리가 badge/칩이 아니라 rawText다. 표식 줄은 "선착순이다/타겟이다/랜덤이다/
 * 캐시백·적립이다"처럼 오퍼의 성격을 말하는 자리지 금액을 다시 적는 자리가 아니다.
 */
export function bannerTag(banner) {
  if (banner.firstCome) return { kind: 'first-come', label: '선착순' }
  if (banner.targeted) return { kind: 'targeted', label: '타겟' }
  const amount = banner.amountSpec
  if (amount) {
    if (amount.kind === 'cashback' || amount.kind === 'points') return { kind: 'cashback', label: '적립' }
    if (amount.random) return { kind: 'random', label: '랜덤' }
  }
  return null
}
