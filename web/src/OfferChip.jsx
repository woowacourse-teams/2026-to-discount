import { isBundle, isUpdated } from './filters.js'
import { track } from './analytics.js'
import { badgesOf } from './couponModel.js'
import { COUPANGEATS_HINT, offerClickProps, offerLink, openWithNotice } from './offerLink.js'
import { PlatformBadge } from './logos.jsx'

export function won(value) {
  return `${value.toLocaleString()}원`
}

// 상위 오퍼(큰 칸)는 '원 할인'으로 끝낸다(2026-10-06 사용자). 아래 작은 칩은 자리가 좁아 그대로.
function offerAmountText(offer, hero = false) {
  if (isBundle(offer)) return offer.rawText // 금액 칸은 정렬값이다(묶음 행사)
  return offer.amount != null ? `${won(offer.amount)}${hero ? ' 할인' : ''}` : offer.rawText
}

// 배지 계산(값의 성격, 멤버십, 한정)은 couponModel.badgesOf가 한다 — 쿠폰 카드와 같은 함수다.
// 운영 칩은 최적을 그리지 않는다(2026-09-12: 보는 사람에게 할 일을 주지 않는 내부 계산 라벨).
// 한정 배지는 원문 그대로 둔다(shortTime false).
const CHIP_BADGE_OPTS = { showBestFit: false, shortTime: false }
// 최고 탭이 서면 값의 성격 배지(불확정, 랜덤, n%)는 안 그린다(예전과 같다).
const NATURE_KINDS = new Set(['qualifier-plain', 'qualifier-random', 'rate'])

// brandLinks는 API가 내려주는 앱별 브랜드 쿠폰 바로가기(brands.yml 출처,
// 플랫폼 키 -> 링크). 그 앱 오퍼에만 건다 — 예를 들어 땡겨요 링크를
// 배민 칩에 걸면 안 된다. 브랜드별 링크가 없으면 사다리를 타고 내려간다.
// 앱 안 브랜드 검색(요기요) -> 구글 검색(땡겨요) -> 앱만 열기(쿠팡이츠,
// 배민). 네 플랫폼 모두 어느 한 칸이 차 있어서 실제로는 링크 없는 칩이
// 없다. 상세를 여는 버튼 경로는 남겨두되 지금은 안 쓰인다(링크가 있는
// 칩은 링크가 우선이라 카드 헤더로 펼친다).
export default function OfferChip({ offer, brandLinks, brandName, detailId, open, onToggle, best, hero, include = null, position = null }) {
  const held = offer.status === 'held'
  // "최대"는 최소주문금액을 채워야 나오는 상한액이고 "특정메뉴"는 메뉴 하나에만 쓰는
  // 값이다 — 둘 다 최고 할인·정렬에서 빠지는 값이라(filters.INCOMPARABLE) 액면대로 읽히지
  // 않도록 칩 전체를 같은 회색으로 깔아 다른 확정값과 구분한다(특정메뉴는 2026-09-19).
  // 랜덤(뽑기)도 같다 — 정렬에서 빠지는 값은 셋 다 같은 회색 칩(2026-09-19). "넣기"를 켜서
  // 정렬에 들어가면 회색을 벗는다(사용자, 2026-09-19).
  const capped = offer.qualifier === '최대'
    || (offer.qualifier === '특정메뉴' && !include?.menu)
    || (offer.qualifier === '랜덤' && !include?.random)
  const badges = badgesOf(offer, CHIP_BADGE_OPTS).filter((x) => !(best && NATURE_KINDS.has(x.kind)))
  // 오퍼 자신의 링크가 먼저다. 배너에서 세운 오퍼만 이걸 갖는다 —
  // 배너의 행사 딜링크가 브랜드 일반 링크에 먹힐서는 안 된다. 반대로
  // 배너와 무관한 칩은 offer.link가 없어 예전대로 브랜드 링크로 간다.
  const link = offerLink(offer, brandLinks, brandName)

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
        {/* 신규(2026-10-05): 오늘 새로 생겼거나 금액이 커진 오퍼. 쿠폰 카드의 신규 배지와 같은 파랑 탭 */}
        {isUpdated(offer) && <span className="offer__range-badge offer__range-badge--new" aria-label="신규 할인">신규 할인</span>}
        {/* 멤버십 라벨은 앱별 이름 하나("배민클럽 전용쿠폰" 원문 대신). 멤버십은 membership 필드(ADR-029)로 판단한다.
            기간·시각 배지는 멤버십과 별개로 늘 그린다(2026-09-21). */}
        {badges.map((x) => (x.kind === 'membership'
          ? <span key={x.kind} className="offer__status-badge offer__status-badge--membership" data-platform={offer.platform}>{x.text}</span>
          : x.kind === 'limited'
            ? <span key={x.kind} className="offer__status-badge">{x.text}</span>
            : <span key={x.kind} className={`offer__range-badge offer__range-badge--${x.kind === 'qualifier-plain' ? 'plain' : x.kind === 'qualifier-random' ? 'random' : 'rate'}`}>{x.text}</span>))}
        </span>
        {offer.soldOut ? (
          <>
            <s className="offer__amount--soldout">{offerAmountText(offer, hero)}</s>
            <span className="offer__soldout-label">품절</span>
          </>
        ) : offerAmountText(offer, hero)}
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
          onClick={(e) => { track('offer_link_click', offerClickProps({ offer, brandName, position, best, where: 'chip' })); openWithNotice(e, link, { offerPrompt: true }) }}
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
      {/* 운영 카드: 큰 칸(메인 오퍼)에만 한 줄, 아래 작은 칩에는 안 붙인다(2026-10-06 사용자) */}
      {hero && link && offer.platform === 'coupangeats' && <p className="ce-note">{COUPANGEATS_HINT}</p>}
    </li>
  )
}
