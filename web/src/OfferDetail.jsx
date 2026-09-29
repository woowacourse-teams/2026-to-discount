import { MEMBERSHIP_LABEL } from './filters.js'
import { PlatformBadge, PLATFORM_BY_KEY } from './logos.jsx'
import { OWN, OWN_LABEL } from './platforms.js'
import { won } from './OfferChip.jsx'

// 같은 앱이라도 쿠폰이 주문금액 구간별로 차등일 수 있어, 항상 "할인금액 -
// 최소주문금액" 쌍의 리스트로 본다. 구간이 있으면 그 목록 그대로, 없으면
// 지금 아는 값(최상단 금액 + 최소주문금액) 한 줄짜리 목록으로 취급한다 —
// 렌더링 쪽에서 "구간이 있을 때만 리스트"와 "없을 때 단일 값" 두 갈래로
// 안 갈라져도 된다.
function detailRows(offer) {
  if (offer.tiers?.length > 0) {
    // 구간에 최소주문이 없는데 대표값이 같은 금액을 말하면 그 값을 쓴다.
    // export가 이미 채워 주지만(export_data.camel_tiers) 옛 export나 다른
    // 경로로 온 데이터도 같은 화면이어야 한다 — "최소주문 미확인"으로
    // 뜨면서 정렬은 그 값으로 되던 어긋남(2026-09-16).
    return [...offer.tiers]
      .map((t) => (t.minOrder == null && t.amount === offer.amount && offer.minOrderAmount != null
        ? { ...t, minOrder: offer.minOrderAmount } : t))
      // 구간이 스스로 멤버십을 말하지 않으면 오퍼 전체의 값을 따른다.
      .map((t) => (t.membership == null && offer.membership ? { ...t, membership: offer.membership } : t))
      .sort((a, b) => b.amount - a.amount)
  }
  // 구간이 없는 오퍼(배너에서 선 것이 대부분)도 멤버십은 조건 줄에 서야 한다. 오퍼 전체에
  // 걸린 값이라 구간 쪽만 보던 앞 판에서는 칩에만 뜨고 상세 조건에는 안 떴다(2026-09-22).
  // 오퍼에는 channel과 via 칸이 없다(API Offer, 계약 offer-cases.json). 읽어도 늘 undefined라
  // 뺐다(2026-09-29). 채널은 구간(tiers[].channel)에만 있다.
  return [{ minOrder: offer.minOrderAmount, amount: offer.amount,
            membership: offer.membership }]
}

// 칩 하나를 펼쳤을 때 나오는 상세 한 칸. 아직 안 채워진 값(최소주문금액,
// 구간 할인)은 감추지 않고 "미확인"으로 드러낸다 — 없다는 사실 자체가
// 사용자에게 필요한 정보이고, 채워지면 이 자리에 그대로 들어온다.
export default function OfferDetail({ offer, brandName }) {
  const platform = PLATFORM_BY_KEY[offer.platform]
  const rows = detailRows(offer)

  return (
    <div className="detail">
      {/* 금액은 칩 버튼과 아래 쿠폰 목록에 이미 있다 — 헤더에 또 찍지 않는다. */}
      <div className="detail__head">
        <PlatformBadge platformKey={offer.platform} brand={brandName} />
        <span className="detail__platform">{platform?.label ?? (offer.platform === OWN ? OWN_LABEL : offer.platform)}</span>
        {offer.status === 'held' && <span className="pill pill--pending">재확인</span>}
      </div>

      <dl className="detail__rows">
        {/* 네 칸 격자는 라벨 옆 칸에 안 들어간다(360px에서 배지가 기한을
            덮었다) — 라벨과 격자를 각각 한 줄 통째로 쓴다. */}
        <dt className="detail__rows-full">할인/조건</dt>
        <dd className="detail__rows-full">
          {/* 구간 한 줄 = 금액 | 채널·멤버십 | 기한 | 최소주문, 네 칸 격자
              (사용자 결정 2026-09-16). 전엔 금액 덩어리에 채널·멤버십이 딸려
              붙고 기한·최소주문이 오른쪽에 몰려, 줄마다 칸이 안 맞았다.
              li는 display:contents라 칸이 줄을 넘어 정렬된다(App.css). */}
          <ul className="detail__tiers">
            {rows.map((t, i) => (
              <li key={i} className="detail__tier">
                <span className="detail__tier-amount">
                  {t.amount == null ? (
                    <span className="detail__unknown">금액 미확인</span>
                  ) : t.soldOut ? (
                    <>
                      <s className="detail__tier-amount--soldout">{won(t.amount)}</s>
                      <span className="offer__soldout-label">품절</span>
                    </>
                  ) : won(t.amount)}
                  {/* percent가 있으면 이 금액이 정률 계산 결과다(요기요
                      cumulative 실측 2026-08-19). %와 상한을 병기한다. */}
                  {t.percent != null && (
                    <span className="detail__tier-percent">
                      ({t.percent}%{t.cap != null && t.cap !== t.amount ? `, 최대 ${won(t.cap)}` : ''})
                    </span>
                  )}
                </span>
                <span className="detail__tier-scope">
                  {/* 채널(배달/포장, 땡겨요 바른치킨처럼 갈릴 때), 구간 멤버십
                      (ADR-029), 이 구간에만 걸리는 조건("사용(발급X) 선착순" —
                      오퍼 전체 조건으로 두면 모든 구간에 걸린 것처럼 읽힌다). */}
                  {t.channel && <span className="detail__channel">{t.channel}</span>}
                  {/* 채널 배지(.detail__channel)와 같은 속성, 색만 앱별(사용자 2026-09-20). */}
                  {t.membership && t.membership !== 'none' && (
                    <span className="detail__channel detail__tier-membership" data-platform={offer.platform}>
                      {MEMBERSHIP_LABEL[offer.platform] ?? t.membership}
                    </span>
                  )}
                  {t.note && <span className="detail__channel">{t.note}</span>}
                </span>
                <span className="detail__tier-expiry">
                  {/* 구간마다 끝나는 날이 다를 수 있다(배민 청년피자 일반
                      08-30 / 클럽 08-31). 오퍼 만료일과 같으면 비운다. */}
                  {t.expiresAt && t.expiresAt !== offer.expiresAt
                    ? `~${t.expiresAt.slice(5).replace('-', '.')}` : ''}
                </span>
                <span className="detail__tier-min">
                  {t.minOrder != null
                    ? <span aria-label={`${won(t.minOrder)} 이상 주문 시`}>{won(t.minOrder)}↑</span>
                    : <span className="detail__unknown">최소주문 미확인</span>}
                </span>
              </li>
            ))}
          </ul>
          {offer.conditions && <p className="detail__condition-note">{offer.conditions}</p>}
        </dd>
      </dl>
    </div>
  )
}
