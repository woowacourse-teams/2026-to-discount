package com.discounttracker.offer;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDate;
import java.util.List;

/**
 * 브랜드 하나에 대한 앱 하나의 할인. 화면에 칩 하나로 그려지는 단위다.
 *
 * <p>{@code status}는 안에서만 enum이고 JSON으로는 프론트가 쓰던
 * {@code "confirmed"}/{@code "held"} 소문자로 나간다.
 *
 * <p>칩을 펼치면 나오는 상세(최소주문금액·구간 할인·조건)는 원장에서 그대로
 * 흘려보낸다. 아직 안 채워진 값은 {@code null}로 내려가고, "미확인"이라고
 * 쓰는 건 화면 몫이다.
 */
public record Offer(String platform, Integer amount, String qualifier,
                    @JsonIgnore OfferStatus status,
                    String rawText, @JsonIgnore String screenshotPath, String capturedAt,
                    Integer minOrderAmount, String tierMode, List<DiscountTier> tiers, String conditions,
                    String expiresAt, String badge, boolean soldOut,
                    // 이 오퍼만 가리키는 곳. 배너에서 세운 오퍼가 그 행사
                    // 딥링크를 들고 온다. null이면 프론트가 브랜드 링크로
                    // 떨어진다 — 브랜드 링크를 대체하지는 않는다.
                    String link) {

    /**
     * 원장 한 줄을 오늘 기준으로 화면에 내보낼 모습으로 바꾼다.
     *
     * <p>종료일이 지난 구간은 빼고, 대표 금액도 남은 구간에 맞춰 내린다
     * ({@link OfferRecord#liveTiers}·{@link OfferRecord#amountAsOf}). 나머지
     * 값은 원장 그대로다.
     */
    public static Offer from(OfferRecord r, LocalDate today) {
        return new Offer(r.platform(), r.amountAsOf(today), r.qualifier(),
                r.status(), r.rawText(), r.screenshotPath(), r.capturedAt(),
                r.minOrderAmount(), r.tierMode(), r.liveTiers(today), r.conditions(), r.expiresAt(), r.badge(),
                Boolean.TRUE.equals(r.soldOut()), r.link());
    }

    @JsonProperty("status")
    public String statusKey() {
        return status.key();
    }

    int amountOrZero() {
        return amount == null ? 0 : amount;
    }

    /**
     * 같은 (브랜드, 앱)에 오퍼가 둘 이상 잡혔을 때 남길 쪽.
     *
     * <p>확정을 우선하고, 같은 등급이면 더 최근에 캡처한 쪽 — 재확인해서
     * 다시 잡은 값이 더 정확하다고 본다(원장 쪽 store.py._prefer와 같은
     * 규칙). 캡처 시각까지 같으면(주로 테스트처럼 인위적으로 같은 값을
     * 넣은 경우) 그제서야 금액이 큰 쪽으로 가른다.
     *
     * <p>bhc 실측(2026-07-31)에서 확인된 문제: alias(대소문자 "bhc"/
     * "BHC")로 묶인 두 레코드 중 옛날 리스트 캡처("BHC", 3,500원,
     * 2026-07-27)가 방금 상세를 확인한 새 레코드("bhc", 3,000원,
     * 2026-07-31)보다 금액이 커서, 금액 기준으로는 옛날 값이 이겨
     * 새로 확인한 최소주문금액이 통째로 묻혔다. 별칭을 잘못 묶어 서로
     * 다른 가게가 한 브랜드로 합쳐지는 사고도 여전히 있을 수 있지만,
     * 조용히 아무거나 버리는 것보다 규칙을 정해두는 편이 낫다.
     *
     * <p>다만 진 쪽의 상세(최소주문금액·구간·조건)까지 통째로 버리지는
     * 않는다 — 예를 들어 예전에 확정으로 잡힌 "5,000원"에 최소주문금액이
     * 없고, 나중에 재확인하며 조건만 캡처한 needs_review 레코드가 있다면
     * 그 조건은 살려서 확정값에 붙인다. 이 병합이 없으면 검수용으로 남겨둔
     * 기록이 API 응답에서 통째로 사라져, 그 정보를 모은 수고가 없던 일이
     * 된다.
     *
     * <p>단, 이긴 쪽과 진 쪽 둘 다 금액을 알고 그 값이 다르면 병합하지
     * 않는다 — 훌랄라참숯바베큐치킨 실측(2026-07-31)에서 확인된 문제:
     * 땡겨요의 확정 5,000원 오퍼(전체 메뉴)에 다른 needs_review
     * 12,100원 오퍼(순살 참숯구이 한정 쿠폰)의 조건 문구가 그대로
     * 붙어, 5,000원 오퍼가 마치 그 메뉴로 한정된 것처럼 보였다. 금액이
     * 다르면 같은 쿠폰의 재확인이 아니라 서로 다른 쿠폰일 가능성이 커서,
     * 상세를 섞어 붙이는 것보다 비워두는 편이 정직하다.
     *
     * <p>반대로 진 쪽 금액을 아예 모르면(예: 쿠폰 조건 문장이 복잡해
     * 자동 매칭에 실패해 금액을 비워 두고 조건만 원문으로 남긴 기록)
     * "금액이 다르다"고 단정할 근거가 없으므로 병합을 막지 않는다 —
     * 꾸브라꼬숯불치킨 실측(2026-07-31)에서 이 경우까지 막았더니 상세를
     * 확인하려 시도했다는 사실 자체가 사라졌다.
     */
    public Offer preferredOver(Offer other) {
        boolean thisWins = status.isConfirmed() == other.status.isConfirmed()
                ? (capturedAt.equals(other.capturedAt)
                        ? amountOrZero() >= other.amountOrZero()
                        : capturedAt.compareTo(other.capturedAt) >= 0)
                : status.isConfirmed();
        Offer winner = thisWins ? this : other;
        Offer loser = thisWins ? other : this;
        return winner.withDetailFrom(loser);
    }

    /**
     * 진 쪽에서 끌어올 수 있는 값. <b>화면 어디에 찍히는 값인지</b>로 가른다.
     *
     * <p>상세를 열어야 보이는 값(최소주문금액, 구간, 조건)은 목록 캡처에
     * 없는 것이 정상이라 끌어온다. 반면 {@code badge}는 목록 카드에 금액과
     * 나란히 찍힌다 — 최신 캡처가 그 카드를 보고도 안 적었으면 "못 봤다"가
     * 아니라 "없어졌다"이다. 그래서 병합하지 않는다.
     *
     * <p>2026-08-22 실측: 청년피자 땡겨요의 근거 없는 backfill 배지가
     * 08-17 자동 전수 캡처를 이기고 되살아났다.
     *
     * <p>{@code expiresAt}도 목록에 찍히는 값이라 같은 이유로 병합하지
     * 않는다. 2026-09-04 실측: 쿠팡이츠 명랑핫도그·뚜레쥬르가 그날 허브에
     * 걸려 있는데도 사라졌다 — 전날 쿠폰함에서 읽은 발급 쿠폰의 "오늘까지"가
     * 같은 브랜드의 허브 타일로 옮겨붙어, 오늘 본 오퍼가 어제 만료된 것으로
     * 판정됐다. 쿠폰은 당일 만료돼도 프로모션은 계속 돈다.
     *
     * <p>tracker의 {@code store.MERGEABLE_DETAIL}과 <b>글자까지 같아야
     * 한다</b>(ADR-016).
     */
    private Offer withDetailFrom(Offer other) {
        boolean sameCoupon = amount == null || other.amount == null || amount.equals(other.amount);
        Integer mergedMinOrder = minOrderAmount != null ? minOrderAmount
                : sameCoupon ? other.minOrderAmount : null;
        List<DiscountTier> mergedTiers = tiers != null ? tiers
                : sameCoupon ? other.tiers : null;
        String mergedConditions = conditions != null ? conditions
                : sameCoupon ? other.conditions : null;
        if (mergedMinOrder == minOrderAmount && mergedTiers == tiers && mergedConditions == conditions) {
            return this;
        }
        // soldOut은 병합하지 않는다 — 이긴 쪽 자신의 amount에 매인 상태라
        // 진 쪽에서 옮겨 붙이면 관계없는 확정 레코드가 잘못 품절로 보인다.
        //
        // link도 병합하지 않는다. 진 쪽 링크는 그쪽 금액으로 가는 길이라,
        // 이긴 금액에 붙이면 화면에 적힌 값과 눌러서 가는 곳이 어긋난다.
        return new Offer(platform, amount, qualifier, status, rawText, screenshotPath, capturedAt,
                mergedMinOrder, tierMode, mergedTiers, mergedConditions, expiresAt, badge, soldOut,
                link);
    }
}
