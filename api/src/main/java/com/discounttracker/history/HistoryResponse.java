package com.discounttracker.history;

import com.discounttracker.insight.InsightService;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * GET /api/brands/{brand}/history 응답. best는 모든 앱 중 최고, byPlatform은 앱 키별 곡선이다(앱을 고르는 화면이 따로 받지 않고 이 응답에서 고른다).
 * byPlatform 칸이 없는 옛 응답이면 웹이 앱 칩을 숨긴다.
 */
public record HistoryResponse(String brand, List<OfferHistory.Point> best, OfferHistory.Summary summary,
                              Map<String, List<OfferHistory.Point>> byPlatform) {

    public static HistoryResponse of(OfferHistory h, String brand, String range, LocalDate today) {
        LocalDate from = switch (range == null ? "1m" : range) {
            case "1m" -> today.minusMonths(1);
            case "3m" -> today.minusMonths(3);
            case "all" -> LocalDate.of(2000, 1, 1);
            default -> throw new IllegalArgumentException("range는 1m, 3m, all 중 하나다: " + range);
        };
        Map<String, List<OfferHistory.Point>> byPlatform = new LinkedHashMap<>();
        for (String p : InsightService.PLATFORMS) byPlatform.put(p, h.bestSeries(brand, p, from, today));
        return new HistoryResponse(brand, h.bestSeries(brand, from, today), h.summary(brand, today), byPlatform);
    }
}
