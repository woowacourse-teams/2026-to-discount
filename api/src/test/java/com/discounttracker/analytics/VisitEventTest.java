package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class VisitEventTest {
    @Test void serverEventKeepsOnlyServerFieldsAndIssuesEventId() {
        VisitEvent e = VisitEvent.server("2026-11-27T00:00:00Z", "survey_answer", "v", "s", Map.of("k", "1"), "h", true);
        assertEquals(new VisitEvent("2026-11-27T00:00:00Z", "survey_answer", "v", "s", null, null, null, null, null, null,
                Map.of("k", "1"), null, "h", true, null, e.eventId(), null), e);
        UUID.fromString(e.eventId());
        assertNotEquals(e.eventId(), VisitEvent.server("t", "x", "v", null, Map.of(), null, null).eventId());
    }
}
