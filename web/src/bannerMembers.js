/**
 * 묶음 배너 한 장에 늘어설 구성원: 브랜드 이름, 금액, 최소주문, 소진 여부.
 *
 * API가 group으로 접은 카드에는 members가 온다(2026-09-29). 묶음은 링크, 기간, 플랫폼이 같은
 * 배너들이고(확정 규칙 4절) 구성원마다 다를 수 있는 것은 브랜드, 금액, 최소주문뿐이라, 그 셋을
 * 구성원마다 그린다. 카드 금액 한 줄("8/7천원")만으로는 어느 값이 누구 것인지, 최소주문이
 * 누구 것인지 안 읽힌다.
 *
 * 카드의 soldOut은 구성원 전원이 소진일 때만 참이라, 한 곳만 소진이면 그 이름만 흐리게 그린다(감사 #6).
 *
 * members가 없는 옛 묶음(brands 배열)은 구성원별 값을 모른다. 금액과 최소주문은 null, 소진은 false다.
 */
export function bannerMemberLabels(banner) {
  if (Array.isArray(banner.members) && banner.members.length > 1) {
    return banner.members.map((m) => ({
      label: m.brandLabel ?? m.brand,
      amount: m.amount ?? null,
      minOrder: m.minOrder ?? null,
      soldOut: !!m.soldOut,
    }))
  }
  const names = banner.brandLabels ?? banner.brands ?? []
  return names.map((label) => ({ label, amount: null, minOrder: null, soldOut: false }))
}

/** 구성원 한 명의 글자. "청년피자 최대 10,000원 18,900원↑". 모르는 값은 뺀다. */
export function memberText(m) {
  const parts = [m.label]
  if (m.amount) parts.push(m.amount)
  if (m.minOrder != null) parts.push(`${m.minOrder.toLocaleString('ko-KR')}원↑`)
  return parts.join(' ')
}
