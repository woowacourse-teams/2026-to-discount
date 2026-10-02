/**
 * 배너 노출·클릭 이벤트에 함께 싣는 배너 속성.
 *
 * 2026-10-02까지 금액·묶음·매진은 클릭에만 실렸고 노출엔 없었다. 그러면 "금액이 클수록 잘 눌리나"를
 * 노출 대비로 볼 수 없다 — 배너 id는 날마다 새로 나서 id만으로는 종류를 못 묶는다. 두 이벤트가 같은
 * 속성을 싣게 한다. 금액은 문자열 원본과 숫자(원, 여러 값이면 가장 큰 값) 둘 다.
 */

/** "7,000원" → 7000, "최대 8,000원" → 8000, "6/5/5천원" → 6000, "1만원" → 10000. 못 읽으면 null. */
export function amountWon(text) {
  if (text == null) return null
  const s = String(text)
  const values = []
  // "6/5/5천원", "3천원": 슬래시로 이어진 숫자 묶음 뒤에 단위가 하나 붙는 꼴
  for (const m of s.matchAll(/([\d.,/]+)\s*(만|천)?\s*원/g)) {
    const unit = m[2] === '만' ? 10000 : m[2] === '천' ? 1000 : 1
    for (const part of m[1].split('/')) {
      const n = Number(part.replace(/,/g, ''))
      if (Number.isFinite(n) && n > 0) values.push(Math.round(n * unit))
    }
  }
  return values.length ? Math.max(...values) : null
}

/** "최대 …" 상한인지, 여러 값("6/5/5천원")인지, 한 값인지. */
export function amountKind(text) {
  if (text == null) return 'none'
  const s = String(text)
  if (s.includes('최대')) return 'max'
  if (/\d\s*\/\s*\d/.test(s)) return 'multi'
  return amountWon(s) == null ? 'text' : 'fixed'
}

/** 선착순 배너가 지금 열렸는가. opensAt("09:00")이 없으면 null. */
export function isOpened(opensAt, now = new Date()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(opensAt ?? '')
  if (!m) return null
  return now.getHours() * 60 + now.getMinutes() >= Number(m[1]) * 60 + Number(m[2])
}

function firstOpensAt(banner) {
  const times = (Array.isArray(banner.members) ? banner.members : []).map((m) => m.opensAt).filter(Boolean).sort()
  return times[0] ?? null
}

/** 노출·클릭 공통 속성. 값이 없으면 null/'none'으로 — 빈 칸과 0을 섞지 않는다. */
export function bannerProps(banner, now = new Date()) {
  const members = Array.isArray(banner.members) ? banner.members.length : (banner.brands?.length ?? 1)
  return {
    banner: banner.id,
    brand: banner.brand ?? 'none',
    platform: banner.platform,
    amount: banner.amount ?? 'none',
    amount_won: amountWon(banner.amount),
    amount_kind: amountKind(banner.amount),
    brands: banner.brands?.length > 1 ? banner.brands.join('/') : (banner.brand ?? 'none'),
    member_count: members,
    group: banner.group ?? null,
    minOrder: banner.minOrder ?? null,
    soldOut: !!banner.soldOut,
    first_come: banner.firstCome ?? null,
    // 여는 시각은 묶음 구성원(members[].opensAt)에만 온다 — 가장 이른 시각과 지금 열렸는지.
    opens_at: firstOpensAt(banner),
    opened: isOpened(firstOpensAt(banner), now),
  }
}
