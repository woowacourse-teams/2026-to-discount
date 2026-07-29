package com.discounttracker.offer;

/**
 * 원장(export.json) 한 줄 그대로. 판독 파이프라인이 만든 값이라 여기서는
 * 해석하지 않고 받기만 한다.
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
        String screenshotPath
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
