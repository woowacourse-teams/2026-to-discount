package com.discounttracker.push;

import com.discounttracker.comparison.BrandComparison;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Certainty;
import com.discounttracker.offer.Offer;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 리팩토링 전 특성 테스트와 점검(2026-11-26 api-b) 재현 테스트. @Disabled는 고칠 때 켠다. */
class PushAuditTest {
    @TempDir Path temp;
    private final ObjectMapper mapper = new ObjectMapper();

    private static final class MovingClock extends Clock {
        Instant now;
        MovingClock(Instant now) { this.now = now; }
        @Override public ZoneId getZone() { return ZoneId.of("Asia/Seoul"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private final MovingClock clock = new MovingClock(Instant.parse("2026-10-08T02:15:00Z"));

    private PushProperties properties() {
        return new PushProperties(true, "public", "private", "mailto:test@example.com",
                temp.resolve("push.json"), "https://front.example/", "https://api.example");
    }

    private PushStateStore store() { return new PushStateStore(properties(), mapper, clock); }

    private PushTrackingToken tokenFor(PushStateStore store, boolean analytics) {
        var sub = store.upsert("https://fcm.googleapis.com/fcm/send/one", "key", "auth", "v_one", analytics);
        return store.createToken("n1", sub.id(), List.of("b1"), "new_offer");
    }

    @Test
    void trackMarksDisplayedOnceAndClickedOnce() {
        var store = store();
        var token = tokenFor(store, true);
        assertThat(store.track(token.token(), "push_notification_displayed")).get()
                .extracting(PushStateStore.TrackingContext::visitorId).isEqualTo("v_one");
        assertThat(store.track(token.token(), "push_notification_displayed")).isEmpty();
        assertThat(store.track(token.token(), "push_notification_clicked")).isPresent();
        assertThat(store.track(token.token(), "push_notification_clicked")).isEmpty();
        assertThat(store.track("missing", "push_notification_clicked")).isEmpty();
    }

    @Test
    void trackWithoutAnalyticsConsentReturnsEmpty() {
        var store = store();
        var token = tokenFor(store, false);
        assertThat(store.track(token.token(), "push_notification_clicked")).isEmpty();
    }

    @Test
    void expiredTokenIsNotTrackable() {
        var store = store();
        var token = tokenFor(store, true);
        clock.now = clock.now.plus(Duration.ofDays(31));
        assertThat(store.track(token.token(), "push_notification_clicked")).isEmpty();
    }

    @Test
    void deliveredAndDailyOfferSurviveRestart() {
        var store = store();
        store.markDelivered("k1");
        var planned = store.dailyOffer("2026-10-08", 123);
        var restored = store();
        assertThat(restored.wasDelivered("k1")).isTrue();
        assertThat(restored.wasDelivered("k2")).isFalse();
        assertThat(restored.dailyOffer("2026-10-08", 999)).isEqualTo(planned);
    }

    @Disabled("audit: 02-api-b.md PushStateStore 만료 토큰을 지우는 코드가 없어 파일이 끝없이 커진다")
    @Test
    void expiredTokensArePrunedOnWrite() throws Exception {
        var store = store();
        var token = tokenFor(store, true);
        clock.now = clock.now.plus(Duration.ofDays(31));
        store.markDelivered("later");
        assertThat(Files.readString(properties().statePath())).doesNotContain(token.token());
    }

    @Disabled("audit: 02-api-b.md PushStateStore 모르는 eventType도 trackable이라 공개 경로에서 쓰기를 일으킨다")
    @Test
    void unknownEventTypeIsIgnored() {
        var store = store();
        var token = tokenFor(store, true);
        assertThat(store.track(token.token(), "anything_else")).isEmpty();
    }

    @Disabled("audit: 02-api-b.md PushStateStore 등록 경로가 PushEndpointPolicy를 검사하지 않는다")
    @Test
    void upsertRejectsDisallowedEndpoint() {
        assertThatThrownBy(() -> store().upsert("http://evil.example/x", "k", "a", "v", true))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void senderSkipsWhenNotConfiguredAndRejectsDisallowedEndpoint() {
        var sub = new PushSubscription("id", "http://evil.example/x", "k", "a", "v", true,
                Instant.EPOCH, Instant.EPOCH, true);
        var off = new PushProperties(false, "", "", "", temp.resolve("p.json"), "", "");
        assertThat(new WebPushSender(off).send(sub, "{}")).isZero();
        assertThatThrownBy(() -> new WebPushSender(properties()).send(sub, "{}"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Disabled("audit: 02-api-b.md WebPushSender 보낼 때마다 PushService를 새로 만든다(제한 시간 없음)")
    @Test
    void senderReusesPushService() {
        AtomicInteger created = new AtomicInteger();
        var sender = new WebPushSender(properties()) {
            @Override nl.martijndwars.webpush.PushService createService() {
                created.incrementAndGet();
                throw new IllegalStateException("stop");
            }
        };
        var sub = new PushSubscription("id", "https://fcm.googleapis.com/fcm/send/x", "k", "a", "v", true,
                Instant.EPOCH, Instant.EPOCH, true);
        for (int i = 0; i < 2; i++) {
            try { sender.send(sub, "{}"); } catch (RuntimeException ignored) { }
        }
        assertThat(created.get()).isLessThanOrEqualTo(1);
    }

    @Disabled("audit: 02-api-b.md NewOfferNotificationService 발송 중 synchronized가 관리 API next()를 막는다")
    @Test
    void managementViewIsNotBlockedBySending() throws Exception {
        var store = store();
        store.dailyOffer("2026-10-08", clock.instant().getEpochSecond());
        store.upsert("https://fcm.googleapis.com/fcm/send/one", "key", "auth", "one", true);
        var comparisons = mock(BrandComparisonService.class);
        when(comparisons.compare()).thenReturn(List.of(brand("BHC", offer(8000))));
        var sender = mock(WebPushSender.class);
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(sender.send(any(), any())).thenAnswer(inv -> {
            entered.countDown();
            release.await(5, TimeUnit.SECONDS);
            return 201;
        });
        var service = service(store, sender, comparisons);
        var sending = CompletableFuture.runAsync(service::sendDueOffer);
        try {
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            var view = CompletableFuture.supplyAsync(() -> service.next(LocalDate.parse("2026-10-08")));
            assertThat(view.get(1, TimeUnit.SECONDS)).isNotNull();
        } finally {
            release.countDown();
            sending.get(5, TimeUnit.SECONDS);
        }
    }

    @Disabled("audit: 02-api-b.md NewOfferNotificationService 정해 둔 대상이 후보에서 빠지면 그날 알림을 소리 없이 완료로 바꾼다")
    @Test
    void changedTargetIsReselectedInsteadOfSilentlyCompleted() {
        var store = store();
        store.dailyOffer("2026-10-08", clock.instant().getEpochSecond());
        store.upsert("https://fcm.googleapis.com/fcm/send/one", "key", "auth", "one", true);
        var comparisons = mock(BrandComparisonService.class);
        var sender = mock(WebPushSender.class);
        when(sender.send(any(), any())).thenReturn(500);
        when(comparisons.compare()).thenReturn(List.of(brand("BHC", offer(8000))));
        service(store, sender, comparisons).sendDueOffer();
        clock.now = clock.now.plus(Duration.ofMinutes(2));
        when(comparisons.compare()).thenReturn(List.of(brand("BHC", offer(9000))));
        when(sender.send(any(), any())).thenReturn(201);
        service(store, sender, comparisons).sendDueOffer();
        verify(sender, times(2)).send(any(), any());
    }

    private NewOfferNotificationService service(PushStateStore store, WebPushSender sender, BrandComparisonService comparisons) {
        return new NewOfferNotificationService(properties(), store, sender, new PushMessageFactory(mapper), comparisons, clock);
    }

    private static BrandComparison brand(String name, Offer... offers) {
        var brand = mock(BrandComparison.class);
        when(brand.name()).thenReturn(name);
        when(brand.offers()).thenReturn(List.of(offers));
        return brand;
    }

    private static Offer offer(int amount) {
        var offer = mock(Offer.class);
        when(offer.amount()).thenReturn(amount);
        when(offer.platform()).thenReturn("coupangeats");
        when(offer.certainty()).thenReturn(Certainty.EXACT);
        when(offer.kind()).thenReturn(AmountKind.DISCOUNT);
        when(offer.firstSeenAt()).thenReturn("2026-10-08T01:00:00Z");
        return offer;
    }
}
