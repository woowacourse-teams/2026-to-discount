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
 * 쿠팡이츠 선착순 오픈은 하루치를 한 장으로 묶는다(2026-09-30 사용자 결정). 구성원마다 여는 시각이
 * 달라 members의 opensAt("09:00")을 이름 앞에 붙인다("9시 뚜레쥬르 최대 6,000원").
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
      opensAt: m.opensAt ?? null,
    }))
  }
  const names = banner.brandLabels ?? banner.brands ?? []
  return names.map((label) => ({ label, amount: null, minOrder: null, soldOut: false, opensAt: null }))
}

/** "09:00" -> "9시", "09:30" -> "9시 30분". 못 읽으면 null. */
export function openHourText(hhmm) {
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  if (!t) return null
  const h = Number(t[1])
  const min = Number(t[2])
  return min ? `${h}시 ${min}분` : `${h}시`
}

/** 구성원 한 명의 글자: 여는 시각과 이름뿐. "9시 청년피자".
 *
 * 금액과 최소주문까지 이름 줄에 넣으니 네 곳 묶음이 두세 줄로 터졌다(2026-10-01 사용자). 배열 묶음
 * 때처럼 금액은 금액 줄(banner.amount)이, 최소주문은 세 번째 줄(memberMinOrderText)이 맡는다. */
export function memberText(m) {
  const at = openHourText(m.opensAt)
  return at ? `${at} ${m.label}` : m.label
}

/** 묶음의 세 번째 줄(예전 extra 자리)에 둘 최소주문. 모두 같으면 "18,000원 이상 주문 시",
 * 다르면 "BHC 18,000원↑ · 뚜레쥬르 15,000원↑", 아무도 모르면 null. */
export function memberMinOrderText(members) {
  const known = members.filter((m) => m.minOrder != null)
  if (!known.length) return null
  const won = (n) => `${n.toLocaleString('ko-KR')}원`
  if (known.length === members.length && known.every((m) => m.minOrder === known[0].minOrder)) {
    return `${won(known[0].minOrder)} 이상 주문 시`
  }
  return known.map((m) => `${m.label} ${won(m.minOrder)}↑`).join(' · ')
}