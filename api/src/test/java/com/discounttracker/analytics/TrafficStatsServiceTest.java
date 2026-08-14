package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class TrafficStatsServiceTest {

    private VisitEvent event(String tsOffsetFromNow, String event, String visitorId, String sessionId,
                              String path, String device, String referrer, Long dwellMs, Map<String, String> props) {
        return event(tsOffsetFromNow, event, visitorId, sessionId, path, device, referrer, dwellMs, props, null);
    }

    private VisitEvent event(String tsOffsetFromNow, String event, String visitorId, String sessionId,
                              String path, String device, String referrer, Long dwellMs, Map<String, String> props,
                              Boolean dev) {
        String ts = OffsetDateTime.now().plusHours(0).toString();
        if (tsOffsetFromNow != null) {
            ts = OffsetDateTime.parse(tsOffsetFromNow).toString();
        }
        return new VisitEvent(ts, event, visitorId, sessionId, 1, path, referrer, device,
                null, dwellMs, props, null, "hash", dev, "event-id");
    }

    private EventLog logWith(Path dir, List<VisitEvent> events) {
        ObjectMapper mapper = new ObjectMapper();
        EventLog log = new EventLog(dir.resolve("events.jsonl").toString(), mapper);
        log.append(events);
        return log;
    }

    @Test
    void countsEventsAndUniqueVisitorsWithinRange(@TempDir Path dir) {
        String now = OffsetDateTime.now().toString();
        EventLog log = logWith(dir, List.of(
                event(now, "page_view", "v1", "s1", "/", "mobile", "direct", null, null),
                event(now, "page_view", "v2", "s2", "/brands", "desktop", "direct", null, null),
                event(now, "page_exit", "v1", "s1", "/", "mobile", "direct", 5000L, null)
        ));
        TrafficStats stats = new TrafficStatsService(log).compute(7);

        assertEquals(3, stats.totalEvents());
        assertEquals(2, stats.uniqueVisitors());
        assertEquals(2, stats.uniqueSessions());
        assertEquals(2L, stats.eventCounts().get("page_view"));
        assertEquals(1L, stats.eventCounts().get("page_exit"));
        assertEquals(5000.0, stats.avgDwellMs());
    }

    @Test
    void excludesEventsOutsideRange(@TempDir Path dir) {
        String withinRange = OffsetDateTime.now().minusDays(1).toString();
        String outsideRange = OffsetDateTime.now().minusDays(30).toString();
        EventLog log = logWith(dir, List.of(
                event(withinRange, "page_view", "v1", "s1", "/", "mobile", "direct", null, null),
                event(outsideRange, "page_view", "v2", "s2", "/", "mobile", "direct", null, null)
        ));
        TrafficStats stats = new TrafficStatsService(log).compute(7);
        assertEquals(1, stats.totalEvents());
    }

    @Test
    void topPathsSortedByCountDescending(@TempDir Path dir) {
        String now = OffsetDateTime.now().toString();
        EventLog log = logWith(dir, List.of(
                event(now, "page_view", "v1", "s1", "/", "mobile", "direct", null, null),
                event(now, "page_view", "v2", "s2", "/", "mobile", "direct", null, null),
                event(now, "page_view", "v3", "s3", "/brands", "mobile", "direct", null, null)
        ));
        TrafficStats stats = new TrafficStatsService(log).compute(7);
        assertEquals("/", stats.topPaths().get(0).name());
        assertEquals(2L, stats.topPaths().get(0).count());
    }

    @Test
    void categoryChangesCountedFromProps(@TempDir Path dir) {
        String now = OffsetDateTime.now().toString();
        EventLog log = logWith(dir, List.of(
                event(now, "category_change", "v1", "s1", "/", null, null, null, Map.of("category", "chicken")),
                event(now, "category_change", "v1", "s1", "/", null, null, null, Map.of("category", "chicken")),
                event(now, "category_change", "v2", "s2", "/", null, null, null, Map.of("category", "pizza"))
        ));
        TrafficStats stats = new TrafficStatsService(log).compute(7);
        assertEquals(2L, stats.categoryChanges().get("chicken"));
        assertEquals(1L, stats.categoryChanges().get("pizza"));
    }

    @Test
    void excludesDevTrafficFromStats(@TempDir Path dir) {
        // dev:true는 본인 테스트 클릭이라 실 트래픽 집계에서 빠져야 한다.
        String now = OffsetDateTime.now().toString();
        EventLog log = logWith(dir, List.of(
                event(now, "page_view", "v1", "s1", "/", "mobile", "direct", null, null),
                event(now, "page_view", "v_dev", "s_dev", "/", "mobile", "direct", null, null, true),
                event(now, "offer_link_click", "v_dev", "s_dev", "/", "mobile", "direct", null,
                        Map.of("brand", "test"), true)
        ));
        TrafficStats stats = new TrafficStatsService(log).compute(7);

        assertEquals(1, stats.totalEvents());
        assertEquals(1, stats.uniqueVisitors());
        assertEquals(1L, stats.eventCounts().get("page_view"));
        assertNull(stats.eventCounts().get("offer_link_click"));
    }

    @Test
    void readsExistingLogWithoutEventId(@TempDir Path dir) throws Exception {
        Path path = dir.resolve("events.jsonl");
        Files.writeString(path, """
                {"ts":"%s","event":"page_view","visitorId":"v_old","sessionId":"s_old","visitCount":1,"path":"/","referrer":"direct","device":"mobile","dev":false}
                """.formatted(OffsetDateTime.now()));

        TrafficStats stats = new TrafficStatsService(
                new EventLog(path.toString(), new ObjectMapper())).compute(7);

        assertEquals(1, stats.totalEvents());
        assertEquals(1, stats.uniqueVisitors());
    }

    @Test
    void noEventsGivesZeroedStats(@TempDir Path dir) {
        EventLog log = new EventLog(dir.resolve("events.jsonl").toString(), new ObjectMapper());
        TrafficStats stats = new TrafficStatsService(log).compute(7);
        assertEquals(0, stats.totalEvents());
        assertNull(stats.avgDwellMs());
        assertTrue(stats.topPaths().isEmpty());
    }
}
