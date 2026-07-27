package com.discounttracker.model;

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
) {}
