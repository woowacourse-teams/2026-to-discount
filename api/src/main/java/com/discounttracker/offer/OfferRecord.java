package com.discounttracker.offer;

import java.util.List;

/**
 * 원장(export.json) 한 줄 그대로. 판독 파이프라인이 만든 값이라 여기서는
 * 해석하지 않고 받기만 한다.
 *
 * <p>{@code minOrderAmount}·{@code tiers}·{@code conditions}는 쿠폰 상세를
 * 열어야 보이는 값이라 지금 원장에선 대부분 비어 있다. 비어 있다는 사실도
 * 데이터다 — 화면에 "미확인"으로 그대로 드러낸다.
 */
public record OfferRecord(
        String platform,
        String brand,
        Integer amount,
        String qualifier,
        boolean needsReview,
        String offerType,
        String section,
        String rawText,
        String capturedAt,
        String screenshotPath,
        Integer minOrderAmount,
        List<DiscountTier> tiers,
        String conditions,
        String expiresAt,
        String badge,
        // Boolean(nullable)이다 — primitive boolean이면 JSON에 "soldOut":null이
        // 들어올 때 MismatchedInputException으로 reload 전체가 깨진다(사람이
        // 직접 export.json을 편집하다 실측, 2026-08-04). null은 false로
        // 본다(Offer.from에서 정규화).
        Boolean soldOut
) {

    /**
     * 금액이 있고 재확인도 필요 없어야 확정이다.
     *
     * <p>{@code qualifier}("최대")는 보지 않는다 — 땡겨요처럼 배너 문구는
     * "최대"지만 실제로는 정가인 경우가 있어, 확정 여부와 문구는 별개다.
     */
    public OfferStatus status() {
        return amount != null && !needsReview ? OfferStatus.CONFIRMED : OfferStatus.HELD;
    }
}
