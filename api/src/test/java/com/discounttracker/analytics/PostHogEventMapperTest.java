package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostHogEventMapperTest {

    private static final Instant NOW = Instant.parse("2026-08-14T02:00:00Z");
    private final PostHogEventMapper mapper =
            new PostHogEventMapper(Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void mapsPageViewUsingHistoricalImportContract() {
        VisitEvent source = event("page_view", false, Map.of(
                "brand", "BBQ",
                "distinct_id", "client-cannot-override",
                "$insert_id", "client-cannot-override"));

        PostHogEvent mapped = mapper.map(source).orElseThrow();

        assertEquals("$pageview", mapped.event());
        assertEquals("2026-08-14T02:00:00Z", mapped.timestamp());
        assertEquals("visitor-1", mapped.properties().get("distinct_id"));
        assertEquals("session-1", mapped.properties().get("source_session_id"));
        assertEquals("event-1", mapped.properties().get("$insert_id"));
        assertEquals(2, mapped.properties().get("visit_count"));
        assertEquals(1200L, mapped.properties().get("dwell_ms"));
        assertEquals("BBQ", mapped.properties().get("brand"));
        assertFalse(mapped.properties().containsKey("ipHash"));
        assertFalse(mapped.properties().containsKey("ip_hash"));
    }

    @Test
    void excludesDeveloperTrafficAndEventsWithoutVisitorId() {
        assertTrue(mapper.map(event("brand_expand", true, Map.of())).isEmpty());

        VisitEvent noVisitor = new VisitEvent(
                "2026-08-14T11:00:00+09:00", "brand_expand", null, "session-1", 1,
                "/", "direct", "mobile", "390x844", null, Map.of(),
                "2026-08-14T01:02:03Z", "private-ip-hash", false, "a", "event-2");
        assertTrue(mapper.map(noVisitor).isEmpty());
    }

    @Test
    void ignoresClientTimestampAndFallsBackToClockWhenServerTimestampIsInvalid() {
        VisitEvent source = new VisitEvent(
                "invalid-server-time", "offer_link_click", "visitor-1", "session-1", 1,
                "/", "direct", "mobile", "390x844", null, Map.of(),
                "2026-08-14T01:02:03Z", "private-ip-hash", false, "a", "event-3");

        assertEquals(NOW.toString(), mapper.map(source).orElseThrow().timestamp());
    }

    @Test
    void marksNarrowDesktopAsSuspectedDeveloperTraffic() {
        // ?dev=1 표시는 브라우저·프로필마다 따로 잡혀 일부만 걸린다. desktop인데
        // 창이 좁으면 반응형 확인이므로 표시를 남긴다(거르지는 않는다).
        assertEquals(true, mapper.map(withDevice("desktop", "360x900"))
                .orElseThrow().properties().get("dev_suspect"));

        // 경계: 400px은 아직 실기기 범위다(가장 넓은 흔한 폰이 430px).
        assertNull(mapper.map(withDevice("desktop", "400x900"))
                .orElseThrow().properties().get("dev_suspect"));

        // 좁아도 mobile이면 그냥 폰이다.
        assertNull(mapper.map(withDevice("mobile", "360x780"))
                .orElseThrow().properties().get("dev_suspect"));

        // 폭을 못 읽으면 모르는 것이지 좁은 것이 아니다 — 실사용자를 조용히
        // 빼지 않는다.
        assertNull(mapper.map(withDevice("desktop", null))
                .orElseThrow().properties().get("dev_suspect"));
        assertNull(mapper.map(withDevice("desktop", "이상한값"))
                .orElseThrow().properties().get("dev_suspect"));
    }

    private VisitEvent withDevice(String device, String viewport) {
        return new VisitEvent(
                "2026-08-14T11:00:00+09:00", "brand_expand", "visitor-1", "session-1", 2,
                "/", "external", device, viewport, null, Map.of(),
                "2026-08-14T01:02:03Z", "private-ip-hash", false, "a", "event-9");
    }

    private VisitEvent event(String name, boolean dev, Map<String, String> props) {
        return new VisitEvent(
                "2026-08-14T11:00:00+09:00", name, "visitor-1", "session-1", 2,
                "/", "external", "mobile", "390x844", 1200L, props,
                "2026-08-14T01:02:03Z", "private-ip-hash", dev, "a", "event-1");
    }
}
