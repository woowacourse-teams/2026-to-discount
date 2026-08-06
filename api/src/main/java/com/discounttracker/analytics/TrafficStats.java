package com.discounttracker.analytics;

import java.util.List;
import java.util.Map;

public record TrafficStats(
        int rangeDays,
        String from,
        String to,
        long totalEvents,
        long uniqueVisitors,
        long uniqueSessions,
        Map<String, Long> eventCounts,
        List<DailyCount> dailyPageViews,
        List<NamedCount> topPaths,
        Map<String, Long> deviceBreakdown,
        List<NamedCount> topReferrers,
        Double avgDwellMs,
        Map<String, Long> categoryChanges
) {
    public record DailyCount(String date, long count) {
    }

    public record NamedCount(String name, long count) {
    }
}
