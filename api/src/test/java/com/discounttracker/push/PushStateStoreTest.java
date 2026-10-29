package com.discounttracker.push;

import com.discounttracker.storage.InterProcessFileLock;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.UncheckedIOException;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.nio.file.Files;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushStateStoreTest {
    @TempDir Path temp;

    private final Clock clock = Clock.fixed(Instant.parse("2026-09-21T02:00:00Z"),
            ZoneId.of("Asia/Seoul"));
    private final ObjectMapper mapper = new ObjectMapper();

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
        assertThat(restored.pending()).hasSize(1);
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

    @Test
    void staleMemoryDoesNotEraseAnotherInstancesWrite() {
        PushStateStore a = new PushStateStore(properties(), mapper, clock);
        PushStateStore b = new PushStateStore(properties(), mapper, clock);

        b.upsert("https://fcm.googleapis.com/b", "key", "auth", "v_b", true);
        a.upsert("https://fcm.googleapis.com/a", "key", "auth", "v_a", true);

        assertThat(new PushStateStore(properties(), mapper, clock).activeSubscriptions())
                .extracting(PushSubscription::visitorId).containsExactlyInAnyOrder("v_a", "v_b");
        assertThat(a.activeSubscriptions()).hasSize(2);
    }

    /** 인증 없는 공개 엔드포인트가 부르는 길이다. 쓸 게 없는 호출이 락을 잡거나 파일을 다시 쓰면 안 된다. */
    @Test
    void unusableTokenAndUnknownSubscriptionNeitherLockNorWrite() throws Exception {
        PushStateStore store = new PushStateStore(properties(), mapper, clock, Duration.ofMillis(200));
        PushSubscription subscription = store.upsert("https://fcm.googleapis.com/sub", "key", "auth",
                "v_123", true);
        PushTrackingToken token = store.createToken("notification", subscription.id(),
                java.util.List.of("banner"), "digest");
        store.track(token.token(), "push_notification_displayed");
        Path state = properties().statePath();
        byte[] before = Files.readAllBytes(state);
        Object keyBefore = Files.readAttributes(state, BasicFileAttributes.class).fileKey();

        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try {
                InterProcessFileLock.withLock(temp.resolve("push.json.lock"), Duration.ofSeconds(5), () -> {
                    held.countDown();
                    try {
                        release.await(10, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    return null;
                });
            } catch (java.io.IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        });
        holder.start();
        try {
            assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();

            // 락을 남이 쥔 동안에도 던지지 않고 돌아와야 한다: 락을 안 잡았다는 증거.
            assertThat(store.track("unknown", "push_notification_displayed")).isEmpty();
            assertThat(store.track(token.token(), "push_notification_displayed")).isEmpty();
            store.deactivate("unknown");
        } finally {
            release.countDown();
            holder.join(5000);
        }

        assertThat(Files.readAllBytes(state)).isEqualTo(before);
        assertThat(Files.readAttributes(state, BasicFileAttributes.class).fileKey()).isEqualTo(keyBefore);
    }

    /** 락을 못 잡으면 쓰지 않고 UncheckedIOException으로 알린다(#192). */
    @Test
    void failsLoudlyWhenTheLockCannotBeTaken() throws Exception {
        PushStateStore store = new PushStateStore(properties(), mapper, clock, Duration.ofMillis(200));
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try {
                InterProcessFileLock.withLock(temp.resolve("push.json.lock"), Duration.ofSeconds(5), () -> {
                    held.countDown();
                    try {
                        release.await(10, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    return null;
                });
            } catch (java.io.IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        });
        holder.start();
        try {
            assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();

            assertThatThrownBy(() -> store.upsert("https://fcm.googleapis.com/sub", "key", "auth", "v_1", true))
                    .isInstanceOf(UncheckedIOException.class);
        } finally {
            release.countDown();
            holder.join(5000);
        }

        assertThat(properties().statePath()).doesNotExist();
    }

    private PushProperties properties() {
        return new PushProperties(true, "public", "private", "mailto:test@example.com",
                temp.resolve("push.json"), "https://front.example/", "https://api.example");
    }
}
