package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InOrder;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AnalyticsEventServiceTest {

    @Test
    void recordsOriginalBeforeEnqueueingAndTriggersWorker(@TempDir Path dir) {
        EventLog eventLog = mock(EventLog.class);
        PostHogEventMapper mapper = mock(PostHogEventMapper.class);
        PostHogOutbox outbox = mock(PostHogOutbox.class);
        PostHogForwardingWorker worker = mock(PostHogForwardingWorker.class);
        VisitEvent event = event(false);
        PostHogEvent mapped = mapped();
        when(mapper.map(event)).thenReturn(Optional.of(mapped));

        new AnalyticsEventService(eventLog, enabledProperties(dir), mapper, outbox, worker)
                .append(List.of(event));

        InOrder order = inOrder(eventLog, outbox, worker);
        order.verify(eventLog).append(List.of(event));
        order.verify(outbox).enqueue("event-1", mapped);
        order.verify(worker).trigger();
    }

    @Test
    void outboxFailureDoesNotChangeOriginalAcceptance(@TempDir Path dir) {
        EventLog eventLog = mock(EventLog.class);
        PostHogEventMapper mapper = mock(PostHogEventMapper.class);
        PostHogOutbox outbox = mock(PostHogOutbox.class);
        PostHogForwardingWorker worker = mock(PostHogForwardingWorker.class);
        VisitEvent event = event(false);
        PostHogEvent mapped = mapped();
        when(mapper.map(event)).thenReturn(Optional.of(mapped));
        doThrow(new UncheckedIOException(new IOException("disk full")))
                .when(outbox).enqueue("event-1", mapped);

        AnalyticsEventService service = new AnalyticsEventService(
                eventLog, enabledProperties(dir), mapper, outbox, worker);

        assertDoesNotThrow(() -> service.append(List.of(event)));
        verify(eventLog).append(List.of(event));
        verify(worker, never()).trigger();
    }

    @Test
    void disabledForwardingOnlyWritesOriginal(@TempDir Path dir) {
        EventLog eventLog = mock(EventLog.class);
        PostHogEventMapper mapper = mock(PostHogEventMapper.class);
        PostHogOutbox outbox = mock(PostHogOutbox.class);
        PostHogForwardingWorker worker = mock(PostHogForwardingWorker.class);
        PostHogProperties disabled = new PostHogProperties(false, "",
                "https://us.i.posthog.com", dir.toString());
        VisitEvent event = event(false);

        new AnalyticsEventService(eventLog, disabled, mapper, outbox, worker)
                .append(List.of(event));

        verify(eventLog).append(List.of(event));
        verify(mapper, never()).map(event);
        verify(worker, never()).trigger();
    }

    private static PostHogProperties enabledProperties(Path dir) {
        return new PostHogProperties(true, "project-token", "https://us.i.posthog.com",
                dir.toString());
    }

    private static VisitEvent event(boolean dev) {
        return new VisitEvent("2026-08-14T11:00:00+09:00", "brand_expand",
                "visitor-1", "session-1", 1, "/", "direct", "mobile", "390x844",
                null, Map.of("brand", "BBQ"), "2026-08-14T02:00:00Z", "ip-hash",
                dev, "a", "event-1", null);
    }

    private static PostHogEvent mapped() {
        return new PostHogEvent("event-1", "brand_expand",
                Map.of("distinct_id", "visitor-1", "$insert_id", "event-1"),
                "2026-08-14T02:00:00Z");
    }
}
