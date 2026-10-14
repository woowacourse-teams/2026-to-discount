package com.discounttracker.history;

import java.time.LocalDate;
import java.util.List;

/** GET /api/brands/{brand}/history 응답. */
public record HistoryResponse(String brand, List<OfferHistory.Point> best, OfferHistory.Summary summary) {

    public static HistoryResponse of(OfferHistory h, String brand, String range, LocalDate today) {
        LocalDate from = switch (range == null ? "1m" : range) {
            case "1m" -> today.minusMonths(1);
            case "3m" -> today.minusMonths(3);
            case "all" -> LocalDate.of(2000, 1, 1);
            default -> throw new IllegalArgumentException("range는 1m, 3m, all 중 하나다: " + range);
        };
        return new HistoryResponse(brand, h.bestSeries(brand, from, today), h.summary(brand, today));
    }
}
