package com.discounttracker.offer;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

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
                    String rawText, String screenshotPath, String capturedAt,
                    Integer minOrderAmount, List<DiscountTier> tiers, String conditions) {

    public static Offer from(OfferRecord r) {
        return new Offer(r.platform(), r.amount(), r.qualifier(),
                r.status(), r.rawText(), r.screenshotPath(), r.capturedAt(),
                r.minOrderAmount(), r.tiers(), r.conditions());
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
     * <p>확정을 우선하고, 같은 등급이면 금액이 큰 쪽. 별칭을 잘못 묶어
     * 서로 다른 가게가 한 브랜드로 합쳐지면 이런 충돌이 생기는데,
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
                ? amountOrZero() >= other.amountOrZero()
                : status.isConfirmed();
        Offer winner = thisWins ? this : other;
        Offer loser = thisWins ? other : this;
        return winner.withDetailFrom(loser);
    }

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
        return new Offer(platform, amount, qualifier, status, rawText, screenshotPath, capturedAt,
                mergedMinOrder, mergedTiers, mergedConditions);
    }
}
