package com.discounttracker.web;

import com.discounttracker.analytics.AnalyticsEventService;
import com.discounttracker.push.PushProperties;
import com.discounttracker.push.PushStateStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class PushTrackingControllerTest {
    @TempDir Path temp;

    @Test
    void clickWritesOnceThenRedirectsToFrontend() {
        Clock clock = Clock.fixed(Instant.parse("2026-09-21T02:00:00Z"), ZoneId.of("Asia/Seoul"));
        PushProperties properties = new PushProperties(true, "public", "private",
                "mailto:test@example.com", temp.resolve("push.json"),
                "https://front.example/", "https://api.example");
        ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
        PushStateStore store = new PushStateStore(properties, mapper, clock);
        var subscription = store.upsert("https://push.example/sub", "key", "auth", "v_123", true);
        var token = store.createToken("notification", subscription.id(), List.of("banner"), "digest");
        AnalyticsEventService analytics = mock(AnalyticsEventService.class);
        PushTrackingController controller = new PushTrackingController(store, analytics, properties, clock);

        var first = controller.clicked(token.token());
        var second = controller.clicked(token.token());

        assertThat(first.getStatusCode().value()).isEqualTo(302);
        assertThat(first.getHeaders().getLocation()).hasToString("https://front.example/");
        assertThat(second.getStatusCode().value()).isEqualTo(302);
        verify(analytics, times(1)).append(anyList());
    }
}
