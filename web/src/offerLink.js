import { isUpdated } from './filters.js'
// brands.yml에 브랜드별 링크가 없는 앱은 여기 링크로 앱만 연다.
// 전부 실기 ADB로 착지 화면까지 확인한 값이다(2026-08-05).
//
// coupangeats: 예전 공유 링크(share.coupangeats.com/RM8HgQyr64b)는
// 프로모션 딥링크였고 이제 "종료된 프로모션 입니다" 화면으로 떨어진다.
// 앱이 선언한 경로 중 할인 화면으로 가는 외부 딥링크는 없어서(와우컬렉션
// WebView URL은 앱 내부 전용, 2026-08-03 확인) 앱 홈만 연다.
//
// ddangyo: 브랜드별 gateway4.html 코드가 대부분 만료됐다("이벤트 준비중").
// 아직 살아있는 gateway.html 코드만 brands.yml에 남기고 나머지는 여기로
// 온다. 앱이 선언한 https 호스트(tblodr.ddangyo.com)는 App Links 검증이
// 안 돼 브라우저로 새니까 커스텀 스킴을 쓴다.
//
// ponytail: 커스텀 스킴이라 앱 미설치면 아무 일도 안 일어난다. 스토어로
// 흘리려면 intent:// + S.browser_fallback_url로 바꿔야 하는데, 그건
// 안드로이드 전용이라 iOS가 깨진다.
const PLATFORM_APP_LINKS = {
  coupangeats: 'coupangeats://',
  ddangyo: 'ddangyo://',
  // capture/baemin.py의 BRAND_LOUNGE_DEEPLINK와 같은 주소 — 브랜드관
  // 목록으로 바로 간다(추측 아니라 캡처 파이프라인이 실기로 확인한 값).
  baemin: 'baemin://./webview?webview_url=' +
    'https%3A%2F%2Finapp-webview.baemin.com%2Fbrand-lounge',
}

// 앱 안 브랜드 검색으로 바로 떨어지는 딥링크. 브랜드별 공유링크가 없을 때
// 앱만 열고 마는 것보다, 구글로 튕기는 것보다 낫다. 추측으로 만들지 않고
// 실기기에서 착지 화면까지 본 것만 넣는다.
//
// yogiyo: 2026-08-19, 2026-08-20 실기 확인(iPhone 12 Pro Max, iOS 26.6).
//   brands.yml의 브랜드 링크와 같은 형식을 쓴다. 값을 바꾸지 말 것.
// coupangeats, ddangyo: 같은 자리에 넣을 값을 아직 못 찾았다.
//   search?keyword=, search?q= 둘 다 앱 홈으로만 떨어지는 것을 같은 날
//   실기로 확인했다.
//
// PLATFORM_APP_LINKS 주석의 마지막 문단이 그대로 적용된다. 커스텀 스킴이라
// 앱이 안 깔려 있으면 아무 일도 안 일어난다. 대신 도착점이 틀리지는 않는다.
const PLATFORM_BRAND_SEARCH_LINKS = {
  yogiyo: (brandName) => `yogiyolink://search?keyword=${encodeURIComponent(brandName)}`,
}

// 구글 검색 폴백은 뺐다(2026-08-31).
//
// 땡겨요만 이 폴백을 쓰고 있었는데, 배달 앱을 열러 온 사람을 브라우저
// 검색 결과로 보내는 것은 이 서비스가 하겠다고 한 일이 아니다. 실제로
// 땡겨요 피자헛 링크를 잠깐 뺐더니 그 칩이 구글로 떨어졌다.
//
// 쿠팡이츠는 같은 상황에서 이미 자기 앱을 여는 쪽을 택하고 있었다.
// 땡겨요도 같은 규칙으로 맞춘다 — PLATFORM_APP_LINKS의 'ddangyo://'가
// 적용돼 최소한 앱은 열린다.
//
// 앱 안 브랜드 검색 딥링크가 있으면 그게 제일 낫지만, 땡겨요에는 없다
// (2026-08-31 dumpsys 확인: ddangyo·o2o 스킴에 검색 경로가 없고
// /benefithub은 광고 SDK 딥링크다). 요기요만 확인돼 있고 그것은
// PLATFORM_BRAND_SEARCH_LINKS에 있다.

// 브랜드별 링크가 없는 앱을 그 앱의 오늘 행사 주소로 보낸다.
//
// 쿠팡이츠는 브랜드별 공유 링크가 하나도 없어(2026-08-31 기준 오퍼 25건
// 전부) 앱 홈이 유일한 도착점이었다. 홈에서 슈퍼딜을 다시 찾아 들어가야
// 하니, 그 화면으로 바로 보내는 편이 낫다.
//
// 주소를 코드에 박지 않는다. 허브 주소는 날짜를 달고 매일 바뀌는데
// (V5_HUB_0831) 박아 두면 다음 날 "종료된 이벤트"로 떨어져 앱 홈만도
// 못하다. 배너는 매일 갱신되므로 거기서 받아 쓴다.
//
// 아무 배너나 쓰면 안 된다. 배너 주소가 한 브랜드 전용 행사일 수 있고,
// 그러면 파스쿠찌를 보러 온 사람이 두찜 행사로 간다. 여러 브랜드를 담은
// 허브 주소만 고른다.
const HUB_LINK_MARKERS = { coupangeats: 'V5_HUB_' }

let hubLinks = {}

// 쿠팡이츠는 오퍼와 배너 모두 이 링크(와우 라운지)로 보낸다(2026-10-06 사용자). 수집이 매일 받는 허브 공유 링크보다 우선.
export const COUPANGEATS_LINK = 'https://share.coupangeats.com/VzILg2hUX6b'

// 쿠팡이츠 허브 쿠폰은 앱에서 '쿠폰 받기'를 눌러야 적용된다(2026-10-06 사용자 확인).
// 위험: 1.5초 뒤 이동은 사용자 제스처 밖이라 iOS 사파리가 앱 대신 웹을 열 수 있다. 실기 확인 필요.
// 쿠팡이츠 행사 허브는 브랜드를 골라 '쿠폰 받기'를 눌러야 할인이 붙는다. 바로 보내기 전에 1.5초 안내(2026-10-06 사용자).
export const COUPANGEATS_NOTICE = '행사 페이지에서\n해당 브랜드를 클릭해주세요!'
// 쿠팡이츠 쿠폰 아래 고정 안내(2026-10-06 사용자 문구)
export const COUPANGEATS_HINT = '앱에서 "브랜드 할인 버튼"을 눌러야 할인이 적용돼요.'
// 2026-10-07 사용자: 처음 누를 때 3.5초, 한 번 본 뒤로는 1초(본 적 있는지는 이 브라우저의 localStorage에 남긴다)
const NOTICE_FIRST_MS = 3500
const NOTICE_MS = 1000
const NOTICE_SEEN_KEY = 'dk_ce_notice_seen'
function noticeMs() {
  try {
    if (localStorage.getItem(NOTICE_SEEN_KEY)) return NOTICE_MS
    localStorage.setItem(NOTICE_SEEN_KEY, '1')
  } catch { /* 저장소가 막혀 있으면 매번 처음처럼 */ }
  return NOTICE_FIRST_MS
}

/** 쿠팡이츠 링크면 기본 이동을 막고 화면을 어둡게 깔아 안내를 1.5초 띄운 뒤 연다. 그 밖의 링크는 손대지 않는다.
 * 웹 주소(https)는 새 탭으로 연다 — 현재 페이지를 떠나지 않게(2026-10-09 사용자). 앱 링크(coupangeats://)는
 * 새 탭에서 열면 브라우저가 about:blank만 띄우고 앱을 안 연다(OfferChip 주석) — 같은 탭에서 부르고, 앱이
 * 열려도 이 페이지는 그대로 남는다. */
export function openWithNotice(e, href, { offerPrompt = false } = {}) {
  if (offerPrompt && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('discount-offer-prompt', { detail: { href } }))
  }
  const tab = typeof href === 'string' && href.startsWith('coupangeats://')
  if ((href !== COUPANGEATS_LINK && !tab) || typeof document === 'undefined') return
  e.preventDefault()
  // 새 탭은 누른 순간 연다 — 안내 뒤(setTimeout)에 열면 팝업 차단(특히 iOS)에 걸린다. 주소는 안내가 끝나고 넣는다.
  const win = tab ? null : window.open('', '_blank')
  document.querySelector('.ce-dim')?.remove()
  // 바텀시트처럼 화면을 어둡게 깔고 그 위에 안내를 띄운다(2026-10-06 사용자)
  const dim = document.createElement('div')
  dim.className = 'ce-dim'
  const el = document.createElement('div')
  el.className = 'ce-toast'
  el.setAttribute('role', 'status')
  el.textContent = COUPANGEATS_NOTICE
  dim.appendChild(el)
  document.body.appendChild(dim)
  setTimeout(() => {
    dim.remove()
    // 앱 링크(탭)는 앱이 없으면 아무 일도 안 일어난다 — 그때만 공유 링크로 다시 보낸다. 앱이 뜨는 동안에도
    // 크롬은 잠시 visible이라(2026-10-07 실기) 상태가 아니라 "떠났다" 신호(blur, hidden, pagehide)로 가른다.
    let left = false
    const mark = () => { left = true }
    if (tab) {
      window.addEventListener('blur', mark, { once: true })
      window.addEventListener('pagehide', mark, { once: true })
      document.addEventListener('visibilitychange', mark, { once: true })
    }
    if (tab) window.location.href = href
    else if (win) { win.opener = null; win.location.href = href } else window.location.href = href // 차단되면 같은 탭
    if (tab) setTimeout(() => { if (!left && document.visibilityState === 'visible') window.location.href = COUPANGEATS_LINK }, 4000) // 앱이 안 열리면 4초 뒤 허브(2026-10-07 사용자: 2.5초 -> 4초)
  }, noticeMs())
}

export function setHubLinks(banners) {
  const next = {}
  for (const banner of banners ?? []) {
    const marker = HUB_LINK_MARKERS[banner?.platform]
    if (!marker || !banner.url || next[banner.platform]) continue
    if (banner.url.includes(marker)) next[banner.platform] = banner.url
  }
  hubLinks = next
}

/** 오퍼 링크 사다리. 오퍼 자신의 링크 → 브랜드 링크 → 앱 안 브랜드 검색 → 허브 → 앱 열기. */
export function offerLink(offer, brandLinks, brandName) {
  // 쿠팡이츠: 수집이 그 쿠폰이 있는 허브 탭 링크(coupangeats://…anchorTabNo=N)를 실었으면 그 탭으로, 아니면 공유 링크(2026-10-07)
  if (offer.platform === 'coupangeats') return offer.link?.startsWith('coupangeats://') ? offer.link : COUPANGEATS_LINK
  return offer.link
    ?? brandLinks?.[offer.platform]
    ?? PLATFORM_BRAND_SEARCH_LINKS[offer.platform]?.(brandName)
    ?? hubLinks[offer.platform]
    ?? PLATFORM_APP_LINKS[offer.platform]
}

/** offer_link_click 속성. 운영 카드와 쿠폰 카드가 같은 키로 남긴다(PostHog 대시보드가 이 키로 가른다). */
export function offerClickProps({ offer, brandName, position, best, where, slot, expanded }) {
  return {
    brand: brandName,
    platform: offer.platform,
    // 카드 순번(1부터). 정렬을 바꾼 뒤 몇 번째 카드가 눌리는지 — 정렬 효과의 근거(2026-09-20).
    position,
    amount: offer.amount ?? null,
    minOrder: offer.minOrderAmount ?? null,
    qualifier: offer.qualifier ?? 'none',
    membership: offer.membership ?? 'none',
    tierMode: offer.tierMode ?? 'none',
    tiers: Array.isArray(offer.tiers) ? offer.tiers.length : 0,
    best: !!best,
    held: offer.status === 'held',
    soldOut: !!offer.soldOut,
    fromBanner: !!offer.link,
    // 2026-10-05 추가: 신규(오늘 새로 생겼거나 금액이 커짐)였는지, 선착순 칸인지, 카드 어디서 눌렀는지.
    isNew: isUpdated(offer),
    firstCome: !!offer.firstCome,
    ...(where ? { where } : {}),          // main(대표 쿠폰) | carousel | expanded(펼친 목록) | chip(운영 카드)
    ...(slot != null ? { slot } : {}),    // 캐러셀이나 펼친 목록에서 몇 번째(1부터)
    ...(expanded != null ? { expanded } : {}),
  }
}
