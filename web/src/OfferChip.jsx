import { track } from './analytics.js'
import { MEMBERSHIP_LABEL } from './filters.js'
import { PlatformBadge } from './logos.jsx'

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

export function setHubLinks(banners) {
  const next = {}
  for (const banner of banners ?? []) {
    const marker = HUB_LINK_MARKERS[banner?.platform]
    if (!marker || !banner.url || next[banner.platform]) continue
    if (banner.url.includes(marker)) next[banner.platform] = banner.url
  }
  hubLinks = next
}

export function won(value) {
  return `${value.toLocaleString()}원`
}

function offerAmountText(offer) {
  return offer.amount != null ? won(offer.amount) : offer.rawText
}

// qualifier -> 배지 색조. 값을 CSS 클래스로 그대로 쓰지 않는 이유는
// 클래스 이름에 한글이 섞이는 걸 피하려는 것뿐이다. 여기 없는 값이
// 새로 생기면 회색(plain)으로 떨어진다 — 모르는 표식을 초록으로
// 띄우는 것보다 낫다.
// 배지로 띄우는 qualifier. 여기 없는 값은 안 그린다.
//
// "최적"과 "행사"는 뺐다(2026-09-12). 둘 다 **보는 사람에게 할 일을 주지
// 않는다** — 최적은 쿠폰을 다 겹쳤을 때라는 내부 계산 라벨이고, 행사는
// 그 브랜드가 배너에 떠 있으면 이미 보인다. 남기면 배지 줄만 길어져
// 정작 조심해야 할 "불확정"이 묻힌다.
//
// 값 자체는 원장·정렬에서 계속 쓴다(filters.js) — 화면에만 안 그린다.
// "랜덤"(뽑기 쿠폰)은 불확정(상한)과 뜻이 다르다 — 값이 사람마다 다르고 내일
// 바뀐다. 배지도 색도 갈라 둔다(2026-09-18).
// 특정메뉴는 불확정(최대)과 같은 회색이다(2026-09-19, 사용자) — 둘 다 "액면 그대로 견주면 안 되는 값".
const QUALIFIER_TONE = { 최대: 'plain', 랜덤: 'random', 특정메뉴: 'plain' }

// brandLinks는 API가 내려주는 앱별 브랜드 쿠폰 바로가기(brands.yml 출처,
// 플랫폼 키 -> 링크). 그 앱 오퍼에만 건다 — 예를 들어 땡겨요 링크를
// 배민 칩에 걸면 안 된다. 브랜드별 링크가 없으면 사다리를 타고 내려간다.
// 앱 안 브랜드 검색(요기요) -> 구글 검색(땡겨요) -> 앱만 열기(쿠팡이츠,
// 배민). 네 플랫폼 모두 어느 한 칸이 차 있어서 실제로는 링크 없는 칩이
// 없다. 상세를 여는 버튼 경로는 남겨두되 지금은 안 쓰인다(링크가 있는
// 칩은 링크가 우선이라 카드 헤더로 펼친다).
export default function OfferChip({ offer, brandLinks, brandName, detailId, open, onToggle, best, hero, include = null, position = null }) {
  const held = offer.status === 'held'
  const showRangeBadge = offer.qualifier in QUALIFIER_TONE
  // "최대"는 최소주문금액을 채워야 나오는 상한액이고 "특정메뉴"는 메뉴 하나에만 쓰는
  // 값이다 — 둘 다 최고 할인·정렬에서 빠지는 값이라(filters.INCOMPARABLE) 액면대로 읽히지
  // 않도록 칩 전체를 같은 회색으로 깔아 다른 확정값과 구분한다(특정메뉴는 2026-09-19).
  // 랜덤(뽑기)도 같다 — 정렬에서 빠지는 값은 셋 다 같은 회색 칩(2026-09-19). "넣기"를 켜서
  // 정렬에 들어가면 회색을 벗는다(사용자, 2026-09-19).
  const capped = offer.qualifier === '최대'
    || (offer.qualifier === '특정메뉴' && !include?.menu)
    || (offer.qualifier === '랜덤' && !include?.random)
  // 유료 멤버십이 있어야 받는 쿠폰인지는 구조화된 membership이 말한다.
  // 예전엔 badge 문자열이 "…전용쿠폰"으로 끝나는지로 갈랐는데, 쿠폰함
  // 순회에서 온 행은 badge가 그냥 "배민클럽"이라 그 검사에 안 걸려
  // 일반 회색 배지로 떨어졌다(2026-09-09 실측 13건 전부). membership을
  // 원장에 남긴 게 바로 이걸 문자열 뒤끝으로 안 물으려는 것이었다.
  // 필드가 아예 없는 옛 행은 예전 규칙으로 받아 준다.
  const memberOnly = (offer.membership && offer.membership !== 'none')
    || offer.badge?.endsWith('전용쿠폰')
  // 오퍼 자신의 링크가 먼저다. 배너에서 세운 오퍼만 이걸 갖는다 —
  // 배너의 행사 딜링크가 브랜드 일반 링크에 먹힐서는 안 된다. 반대로
  // 배너와 무관한 칩은 offer.link가 없어 예전대로 브랜드 링크로 간다.
  const link = offer.link
    ?? brandLinks?.[offer.platform]
    ?? PLATFORM_BRAND_SEARCH_LINKS[offer.platform]?.(brandName)
    ?? hubLinks[offer.platform]
    ?? PLATFORM_APP_LINKS[offer.platform]

  const content = (
    <>
      <span className="offer__amount">
        {/* 최고와 qualifier는 동시에 붙지 않는다(조건 붙은 값은 최고
            후보에서 빠진다) — 같은 자리, 같은 배지를 색만 바꿔 쓴다. */}
        {/* 최고 할인은 칩 왼쪽에 라벨로 붙인다 — 금액 위에 떠 있던
            배지는 카드가 여럿 늘어서면 어느 칩 것인지 헷갈렸다. */}

        {/* 위 칸(qualifier 자리)은 금액의 성격을 말한다 — "최대 할인
            금액"이나 "n%할인"처럼 그 숫자가 어떻게 나온 값인지. 아래
            칸은 멤버십·조건 배지 몫이다. */}
        {/* qualifier 셋은 성격이 서로 다르다 — 색으로 갈라 둔다.
            불확정(최대)과 특정메뉴는 액면 그대로 견주면 안 되는 값이라 같은 회색으로 물러나고,
            랜덤은 뽑기라 검은 배지, 최적은 쿠폰을 다 겹쳤을 때의 값이라 초록으로 앞에 세운다. */}
        {/* 최고 할인도 같은 포스트잇 — 자리는 원래대로 왼쪽 위, 색(네온 그라디언트)은 그대로(2026-09-21). */}
        <span className="chip-tags">
        {/* 탭은 전부 이 한 줄에 왼쪽부터 선다(사용자 2026-09-22). 순서가 뜻이다 —
            "최고"(값의 순위) 다음에 값의 성격(불확정·랜덤·n%), 그 다음 누구만
            쓰는지(멤버십), 마지막이 언제까지인지(기간·시각). */}
        {best && (
          <span className="offer__range-badge offer__range-badge--best-tab" aria-label="최고 할인">최고</span>
        )}
        {!best && showRangeBadge && (
          <span className={`offer__range-badge offer__range-badge--${QUALIFIER_TONE[offer.qualifier] ?? 'plain'}`}>
            {offer.qualifier === '최대' ? '불확정' : offer.qualifier}
          </span>
        )}
        {!best && !showRangeBadge && /^\d+%할인$/.test(offer.badge || '') && (
          <span className="offer__range-badge offer__range-badge--rate">{offer.badge}</span>
        )}
        {/* "배민클럽 전용쿠폰" 같은 원문 대신 이름만 남긴다 — 칩이 이미
            그 앱 하나로 정해져 있으니 "전용쿠폰"은 군더더기다. 그 외
            배지("선착순" 등)는 원문 그대로 둔다. */}
        {/* 멤버십(배민클럽·와우) 배지는 **여기, 오퍼 버튼 아래**에 남긴다.
            2026-09-15 "카드 하단 멤버십 배지 제거"는 펼친 상세의 구간 줄
            (detail__tier-membership) 얘기였는데 이쪽까지 뗐다가 되돌렸다
            (사용자 지적 2026-09-16). 라벨은 원문("배민클럽 전용쿠폰") 대신
            앱별 이름 하나다. */}
        {/* 멤버십은 badge 원문이 아니라 membership 필드(ADR-029)로 판단한다 —
            허브 관측이 쿠폰함 관측을 이기면 badge는 비고 membership만 남는다
            (2026-09-16 던킨 쿠팡이츠). badge가 있어야만 그리면 그때 사라진다. */}
        {memberOnly && (
          <span className="offer__status-badge offer__status-badge--membership" data-platform={offer.platform}>
            {MEMBERSHIP_LABEL[offer.platform] ?? offer.badge}
          </span>
        )}
        {/* 멤버십과 별개로 기간·시각 배지("오늘 17시 선착순")는 늘 그린다 — 배너 오퍼가
            와우 전용이 되면서 시각 배지가 사라졌다(2026-09-21). 배지 원문이 멤버십 문구
            그 자체("쿠팡와우 전용쿠폰", "배민클럽")일 때만 위의 멤버십 탭이 대신한다. */}
        {offer.badge && !/^\d+%할인$/.test(offer.badge) && !/전용|클럽|패스/.test(offer.badge) && (
          <span className="offer__status-badge">{offer.badge}</span>
        )}
        </span>
        {offer.soldOut ? (
          <>
            <s className="offer__amount--soldout">{offerAmountText(offer)}</s>
            <span className="offer__soldout-label">품절</span>
          </>
        ) : offerAmountText(offer)}
      </span>
      <span className="offer__icon-badge">
        <PlatformBadge platformKey={offer.platform} brand={brandName} />
      </span>
    </>
  )

  return (
    <li className={`offer ${held ? 'offer--held' : 'offer--confirmed'}${best ? ' offer--best' : ''}${capped ? ' offer--capped' : ''}${hero ? ' offer--hero' : ''}`}>
      {link ? (
        <a
          className="offer__chip offer__chip--link"
          href={link}
          // 커스텀 스킴(coupangeats://, ddangyo://, baemin://)은 새 탭에서
          // 열면 브라우저가 about:blank만 띄우고 인텐트를 넘기지 않는다.
          // 같은 탭에서 열어야 앱으로 간다. http(s) 링크만 새 탭에 둔다.
          target={link.startsWith('http') ? '_blank' : undefined}
          rel={link.startsWith('http') ? 'noreferrer' : undefined}
          // 어느 오퍼를 눌렀는지까지 남긴다 — brand·platform만으로는 "bhc 배민"에
          // 여러 구간·멤버십 오퍼가 있을 때 무엇이 눌렸는지 못 본다(2026-09-17).
          onClick={() => track('offer_link_click', {
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
            held,
            soldOut: !!offer.soldOut,
            fromBanner: !!offer.link,
          })}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          className="offer__chip offer__chip--toggle"
          aria-expanded={open}
          aria-controls={detailId}
          title={open ? '눌러서 접기' : '눌러서 자세히 보기'}
          onClick={onToggle}
        >
          {content}
          <span className="sr-only">상세 조건 {open ? '접기' : '펼치기'}</span>
        </button>
      )}
    </li>
  )
}
