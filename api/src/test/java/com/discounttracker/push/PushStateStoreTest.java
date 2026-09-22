package com.discounttracker.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.nio.file.Files;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PushStateStoreTest {
    @TempDir Path temp;

    private final Clock clock = Clock.fixed(Instant.parse("2026-09-21T02:00:00Z"),
            ZoneId.of("Asia/Seoul"));
    private final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @Test
    void updatesVisitorAndRestoresStateWithoutCreatingDuplicateActivation() {
        PushProperties properties = properties();
        PushStateStore store = new PushStateStore(properties, mapper, clock);

        store.upsert("https://fcm.googleapis.com/sub", "key", "auth", "v_old", true);
        store.upsert("https://fcm.googleapis.com/sub", "key", "auth", "v_new", true);
        assertThat(store.activeSubscriptions()).singleElement()
                .extracting(PushSubscription::visitorId).isEqualTo("v_new");

        assertThat(store.observe(Map.of("banner", false), Map.of("banner", false))).isEmpty();
        assertThat(store.observe(Map.of("banner", true), Map.of("banner", false))).hasSize(1);

        PushStateStore restored = new PushStateStore(properties, mapper, clock);
        assertThat(restored.observe(Map.of("banner", true), Map.of("banner", false))).isEmpty();
        assertThat(restored.pendingSince(clock.instant().minusSeconds(1))).hasSize(1);
    }

    @Test
    void trackingTokenCanRecordEachEventOnlyOnce() {
        PushStateStore store = new PushStateStore(properties(), mapper, clock);
        PushSubscription subscription = store.upsert("https://fcm.googleapis.com/sub", "key", "auth",
                "v_123", true);
        PushTrackingToken token = store.createToken("notification", subscription.id(),
                java.util.List.of("banner"), "digest");

        assertThat(store.track(token.token(), "push_notification_displayed")).isPresent();
        assertThat(store.track(token.token(), "push_notification_displayed")).isEmpty();
        assertThat(store.track(token.token(), "push_notification_clicked")).isPresent();
        assertThat(store.track(token.token(), "push_notification_clicked")).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "not-json",
            "null",
            "{\"subscriptions\":null}",
            "{\"banners\":null}",
            "{\"tokens\":null}",
            "{\"delivered\":null}"
    })
    void isolatesDamagedStateAndStartsEmpty(String damagedState) throws Exception {
        Files.writeString(properties().statePath(), damagedState);

        PushStateStore store = new PushStateStore(properties(), mapper, clock);

        assertThat(store.activeSubscriptions()).isEmpty();
        assertThat(properties().statePath()).doesNotExist();
        assertThat(temp.resolve("push.json.corrupt-" + clock.instant().toEpochMilli())).exists();
    }

    @Test
    void keepsUndeliveredActivationPendingAfterMoreThanTwentyFourHours() {
        Clock oldClock = Clock.fixed(clock.instant().minusSeconds(60L * 60 * 48),
                ZoneId.of("Asia/Seoul"));
        PushStateStore oldStore = new PushStateStore(properties(), mapper, oldClock);
        oldStore.observe(Map.of("banner", true), Map.of("banner", false));

        PushStateStore restored = new PushStateStore(properties(), mapper, clock);

        assertThat(restored.pending()).singleElement()
                .extracting(BannerNotificationState::bannerId).isEqualTo("banner");
    }

    private PushProperties properties() {
        return new PushProperties(true, "public", "private", "mailto:test@example.com",
                temp.resolve("push.json"), "https://front.example/", "https://api.example");
    }
}
