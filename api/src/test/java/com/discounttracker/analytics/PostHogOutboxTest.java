package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostHogOutboxTest {

    @Test
    void pendingStateSurvivesNewOutboxInstance(@TempDir Path dir) throws Exception {
        MutableClock clock = new MutableClock(Instant.parse("2026-08-14T00:00:00Z"));
        PostHogProperties properties = properties(dir);
        PostHogEvent event = event("event-1");

        new PostHogOutbox(properties, new ObjectMapper(), clock).enqueue("event-1", event);
        assertFalse(Files.readString(dir.resolve("pending/event-1.json"))
                .contains("project-token"));
        PostHogOutbox restarted = new PostHogOutbox(properties, new ObjectMapper(), clock);

        List<PostHogDelivery> claimed = restarted.claimDue(20);
        assertEquals(1, claimed.size());
        assertEquals(1, claimed.get(0).attemptCount());
        assertEquals(event, claimed.get(0).payload());
        assertTrue(restarted.claimDue(20).isEmpty());
    }

    @Test
    void successDeletesPendingFile(@TempDir Path dir) {
        MutableClock clock = new MutableClock(Instant.parse("2026-08-14T00:00:00Z"));
        PostHogOutbox outbox = new PostHogOutbox(properties(dir), new ObjectMapper(), clock);
        outbox.enqueue("event-1", event("event-1"));

        List<PostHogDelivery> claimed = outbox.claimDue(20);
        outbox.markSucceeded(claimed);

        assertFalse(Files.exists(dir.resolve("pending/event-1.json")));
        assertTrue(outbox.claimDue(20).isEmpty());
    }

    @Test
    void retriesOnlyAfterOneHourAndMovesFifthFailureToDeadLetter(@TempDir Path dir)
            throws Exception {
        MutableClock clock = new MutableClock(Instant.parse("2026-08-14T00:00:00Z"));
        ObjectMapper mapper = new ObjectMapper();
        PostHogOutbox outbox = new PostHogOutbox(properties(dir), mapper, clock);
        outbox.enqueue("event-1", event("event-1"));

        for (int expectedAttempt = 1; expectedAttempt <= 5; expectedAttempt++) {
            List<PostHogDelivery> claimed = outbox.claimDue(20);
            assertEquals(1, claimed.size());
            assertEquals(expectedAttempt, claimed.get(0).attemptCount());
            outbox.markFailed(claimed, "HTTP 503");
            if (expectedAttempt < 5) {
                clock.advance(Duration.ofMinutes(59));
                assertTrue(outbox.claimDue(20).isEmpty());
                clock.advance(Duration.ofMinutes(1));
            }
        }

        Path deadLetter = dir.resolve("dead-letter/event-1.json");
        assertFalse(Files.exists(dir.resolve("pending/event-1.json")));
        assertTrue(Files.exists(deadLetter));
        PostHogDelivery failed = mapper.readValue(deadLetter.toFile(), PostHogDelivery.class);
        assertEquals(5, failed.attemptCount());
        assertEquals("HTTP 503", failed.lastError());
        assertTrue(failed.failedAtEpochMs() != null);
        clock.advance(Duration.ofHours(10));
        assertTrue(outbox.claimDue(20).isEmpty());
    }

    @Test
    void rejectsUnsafeEventId(@TempDir Path dir) {
        PostHogOutbox outbox = new PostHogOutbox(properties(dir), new ObjectMapper(),
                Clock.systemUTC());
        assertThrows(IllegalArgumentException.class,
                () -> outbox.enqueue("../escape", event("event-1")));
    }

    @Test
    void recoveredFifthClaimDoesNotProduceSixthAttempt(@TempDir Path dir) {
        MutableClock clock = new MutableClock(Instant.parse("2026-08-14T00:00:00Z"));
        ObjectMapper mapper = new ObjectMapper();
        PostHogProperties properties = properties(dir);
        PostHogOutbox outbox = new PostHogOutbox(properties, mapper, clock);
        outbox.enqueue("event-1", event("event-1"));

        for (int attempt = 1; attempt < 5; attempt++) {
            List<PostHogDelivery> claimed = outbox.claimDue(20);
            outbox.markFailed(claimed, "HTTP 503");
            clock.advance(Duration.ofHours(1));
        }
        assertEquals(5, outbox.claimDue(20).get(0).attemptCount());

        // 다섯 번째 claim 직후 프로세스가 종료된 상황을 새 인스턴스로 모사한다.
        clock.advance(Duration.ofHours(1));
        PostHogOutbox restarted = new PostHogOutbox(properties, mapper, clock);
        assertTrue(restarted.claimDue(20).isEmpty());
        assertTrue(Files.exists(dir.resolve("dead-letter/event-1.json")));
    }

    private static PostHogProperties properties(Path dir) {
        return new PostHogProperties(true, "project-token", "https://us.i.posthog.com",
                dir.toString());
    }

    private static PostHogEvent event(String eventId) {
        return new PostHogEvent("brand_expand",
                Map.of("distinct_id", "visitor-1", "$insert_id", eventId),
                "2026-08-14T00:00:00Z");
    }

    static final class MutableClock extends Clock {
        private Instant instant;

        MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
