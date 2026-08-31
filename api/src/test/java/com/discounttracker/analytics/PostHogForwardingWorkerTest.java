package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PostHogForwardingWorkerTest {

    @Test
    void successfulImmediateAttemptRemovesPending(@TempDir Path dir) {
        Fixture fixture = new Fixture(dir);
        when(fixture.client.sendBatch(anyList())).thenReturn(PostHogClient.Result.succeeded());
        fixture.outbox.enqueue("event-1", event());

        fixture.worker.trigger();

        verify(fixture.client).sendBatch(anyList());
        assertFalse(Files.exists(dir.resolve("pending/event-1.json")));
    }

    @Test
    void attemptsAtMostFiveTimesOneHourApart(@TempDir Path dir) {
        Fixture fixture = new Fixture(dir);
        when(fixture.client.sendBatch(anyList()))
                .thenReturn(PostHogClient.Result.failed("HTTP 503"));
        fixture.outbox.enqueue("event-1", event());

        fixture.worker.trigger();
        fixture.worker.processDue();
        verify(fixture.client, times(1)).sendBatch(anyList());

        for (int attempt = 2; attempt <= 5; attempt++) {
            fixture.clock.advance(Duration.ofHours(1));
            fixture.worker.processDue();
        }

        verify(fixture.client, times(5)).sendBatch(anyList());
        assertTrue(Files.exists(dir.resolve("dead-letter/event-1.json")));
        fixture.clock.advance(Duration.ofHours(10));
        fixture.worker.processDue();
        verify(fixture.client, times(5)).sendBatch(anyList());
    }

    private static PostHogEvent event() {
        return new PostHogEvent("event-1", "offer_link_click",
                Map.of("distinct_id", "visitor-1", "$insert_id", "event-1"),
                "2026-08-14T00:00:00Z");
    }

    private static final class Fixture {
        final PostHogOutboxTest.MutableClock clock =
                new PostHogOutboxTest.MutableClock(Instant.parse("2026-08-14T00:00:00Z"));
        final PostHogProperties properties;
        final PostHogOutbox outbox;
        final PostHogClient client = mock(PostHogClient.class);
        final PostHogForwardingWorker worker;

        Fixture(Path dir) {
            properties = new PostHogProperties(true, "project-token",
                    "https://us.i.posthog.com", dir.toString());
            outbox = new PostHogOutbox(properties, new ObjectMapper(), clock);
            worker = new PostHogForwardingWorker(properties, outbox, client, Runnable::run);
        }
    }
}
