/**
 * 배너 오른쪽 위에 붙는 표식. 칸에서 바로 나온다.
 *
 * 예전에는 period와 extra 문장에 "선착순"이나 "랜덤"이 있는지 봤다. 서버가 구조 칸으로
 * 만든 문장을 화면이 다시 읽던 자리다(2026-09-18에 없애기로 한 파싱).
 *
 * 구조 금액 칸은 응답에서 amountSpec이다 - api Banner.java의 amountSpec 레코드 칸을
 * 그대로 받는다. amount는 옛 문자열 칸("30% 할인" 같은 화면 문구)이라 여기서는 안 읽는다.
 *
 * 캐시백과 적립을 갈라 쓴다. 비교 규칙에서는 둘 다 최고 후보에서 빠져 차이가 없지만,
 * 받은 값을 어디서 쓸 수 있는지가 달라 문구가 달라야 한다. 캐시백은 그 결제 수단이
 * 닿는 곳이면 어디서든 쓰고, 적립은 그 브랜드나 그 앱 안에서만 쓴다.
 *
 * 정률(percent) 그 자체는 여기서 표식으로 안 만든다. 서버가 만든 amount 문구("30%
 * 할인")가 이미 금액 자리에 그대로 뜨고, 자사 정률 배너가 오퍼로 설 때는 offer.badge의
 * `n%할인` 칩(App.jsx)이 그 값을 또 보여준다. 표식 줄은 "선착순이다/타겟이다/랜덤이다/
 * 캐시백·적립이다"처럼 오퍼의 성격을 말하는 자리지 금액을 다시 적는 자리가 아니다.
 */
export function bannerTag(banner) {
  if (banner.firstCome) return { kind: 'first-come', label: '선착순' }
  if (banner.targeted) return { kind: 'targeted', label: '타겟' }
  const amount = banner.amountSpec
  if (amount) {
    if (amount.kind === 'cashback') return { kind: 'cashback', label: '캐시백' }
    if (amount.kind === 'points') return { kind: 'cashback', label: '적립' }
    if (amount.random) return { kind: 'random', label: '랜덤' }
  }
  return null
}
