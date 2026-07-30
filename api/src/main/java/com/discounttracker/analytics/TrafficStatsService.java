package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TrafficStatsService {

    private static final int TOP_N = 10;

    private final EventLog log;
    private final ObjectMapper mapper = new ObjectMapper();

    public TrafficStatsService(EventLog log) {
        this.log = log;
    }

    public TrafficStats compute(int days) {
        OffsetDateTime to = OffsetDateTime.now();
        OffsetDateTime from = to.minusDays(days);

        List<VisitEvent> events = readEvents().stream()
                .filter(e -> withinRange(e, from))
                .toList();

        Map<String, Long> eventCounts = new LinkedHashMap<>();
        Map<String, Long> pathCounts = new LinkedHashMap<>();
        Map<String, Long> deviceCounts = new LinkedHashMap<>();
        Map<String, Long> referrerCounts = new LinkedHashMap<>();
        Map<String, Long> dailyPageViews = new LinkedHashMap<>();
        Map<String, Long> categoryChanges = new LinkedHashMap<>();
        java.util.Set<String> visitors = new java.util.HashSet<>();
        java.util.Set<String> sessions = new java.util.HashSet<>();
        long dwellSum = 0;
        long dwellCount = 0;

        for (VisitEvent e : events) {
            eventCounts.merge(e.event(), 1L, Long::sum);
            if (e.visitorId() != null) visitors.add(e.visitorId());
            if (e.sessionId() != null) sessions.add(e.sessionId());

            if ("page_view".equals(e.event())) {
                if (e.path() != null) pathCounts.merge(e.path(), 1L, Long::sum);
                deviceCounts.merge(e.device() == null ? "unknown" : e.device(), 1L, Long::sum);
                referrerCounts.merge(e.referrer() == null ? "unknown" : e.referrer(), 1L, Long::sum);
                String date = localDate(e);
                if (date != null) dailyPageViews.merge(date, 1L, Long::sum);
            }
            if ("page_exit".equals(e.event()) && e.dwellMs() != null) {
                dwellSum += e.dwellMs();
                dwellCount++;
            }
            if ("category_change".equals(e.event()) && e.props() != null) {
                String category = e.props().get("category");
                if (category != null) categoryChanges.merge(category, 1L, Long::sum);
            }
        }

        return new TrafficStats(
                days, from.toString(), to.toString(),
                events.size(), visitors.size(), sessions.size(),
                eventCounts,
                sortedDaily(dailyPageViews),
                topN(pathCounts),
                deviceCounts,
                topN(referrerCounts),
                dwellCount == 0 ? null : (double) dwellSum / dwellCount,
                categoryChanges
        );
    }

    private List<VisitEvent> readEvents() {
        Path path = log.path();
        if (!Files.exists(path)) return List.of();
        try {
            List<VisitEvent> events = new ArrayList<>();
            for (String line : Files.readAllLines(path)) {
                if (line.isBlank()) continue;
                events.add(mapper.readValue(line, VisitEvent.class));
            }
            return events;
        } catch (IOException ex) {
            throw new UncheckedIOException("이벤트 로그 읽기 실패: " + path, ex);
        }
    }

    private static boolean withinRange(VisitEvent e, OffsetDateTime from) {
        if (e.ts() == null) return false;
        try {
            return !OffsetDateTime.parse(e.ts()).isBefore(from);
        } catch (DateTimeParseException ex) {
            return false;
        }
    }

    private static String localDate(VisitEvent e) {
        try {
            return OffsetDateTime.parse(e.ts()).toLocalDate().toString();
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private static List<TrafficStats.DailyCount> sortedDaily(Map<String, Long> byDate) {
        return byDate.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(en -> new TrafficStats.DailyCount(en.getKey(), en.getValue()))
                .toList();
    }

    private static List<TrafficStats.NamedCount> topN(Map<String, Long> counts) {
        List<TrafficStats.NamedCount> all = new ArrayList<>();
        counts.forEach((name, count) -> all.add(new TrafficStats.NamedCount(name, count)));
        all.sort(Comparator.comparing(TrafficStats.NamedCount::count, Comparator.reverseOrder()));
        return all.size() > TOP_N ? all.subList(0, TOP_N) : all;
    }
}
