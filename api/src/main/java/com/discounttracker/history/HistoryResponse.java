package com.discounttracker.history;

import com.discounttracker.insight.InsightService;

import java.time.LocalDate;
import java.util.List;

/** GET /api/brands/{brand}/history 응답. platform은 요청한 앱(전체면 null). 웹이 옛 API 응답(칸 없음)을 가려내는 데 쓴다. */
public record HistoryResponse(String brand, List<OfferHistory.Point> best, OfferHistory.Summary summary, String platform) {

    public static HistoryResponse of(OfferHistory h, String brand, String range, LocalDate today) {
        return of(h, brand, null, range, today);
    }

    /** platform이 null이면 전체, 아니면 그 앱 하나의 곡선. 모르는 앱은 IllegalArgumentException. */
    public static HistoryResponse of(OfferHistory h, String brand, String platform, String range, LocalDate today) {
        if (platform != null && !InsightService.PLATFORMS.contains(platform))
            throw new IllegalArgumentException("platform을 모른다: " + platform);
        LocalDate from = switch (range == null ? "1m" : range) {
            case "1m" -> today.minusMonths(1);
            case "3m" -> today.minusMonths(3);
            case "all" -> LocalDate.of(2000, 1, 1);
            default -> throw new IllegalArgumentException("range는 1m, 3m, all 중 하나다: " + range);
        };
        return new HistoryResponse(brand, h.bestSeries(brand, platform, from, today), h.summary(brand, platform, today), platform);
    }
}
