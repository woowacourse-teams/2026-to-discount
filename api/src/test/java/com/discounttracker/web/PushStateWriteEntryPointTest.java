package com.discounttracker.web;

import com.discounttracker.analytics.AnalyticsEventService;
import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.push.BannerNotificationService;
import com.discounttracker.push.NewOfferNotificationService;
import com.discounttracker.push.PushMessageFactory;
import com.discounttracker.push.PushProperties;
import com.discounttracker.push.PushStateStore;
import com.discounttracker.push.WebPushSender;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * #192 설계 표를 박는다. 임시 인스턴스(enabled=false, statePath 설정)에서 어떤 진입점이 상태 파일을 쓰는가.
 * 누가 configured() 확인을 더하거나 빼면 여기가 틀어진다.
 */
class PushStateWriteEntryPointTest {
    @TempDir Path temp;

    Path file;
    Clock clock = Clock.fixed(Instant.parse("2026-09-21T02:00:00Z"), ZoneId.of("Asia/Seoul"));
    PushProperties disabled;
    PushStateStore store;

    @BeforeEach
    void setUp() {
        file = temp.resolve("push.json");
        disabled = new PushProperties(false, "public", "private", "mailto:t@example.com", file,
                "https://front.example/", "https://api.example");
        store = new PushStateStore(disabled, new ObjectMapper(), clock);
    }

    @Test
    void unsubscribeTrackAndObserveWriteEvenWhenDisabled() throws Exception {
        var subscription = store.upsert("https://fcm.googleapis.com/x", "k", "a", "v", true);
        var token = store.createToken("n", subscription.id(), List.of("b"), "digest");

        Files.delete(file);
        new PushSubscriptionController(disabled, store)
                .unsubscribe(new PushSubscriptionController.UnsubscribeRequest("https://fcm.googleapis.com/x"));
        assertThat(file).exists();

        Files.delete(file);
        new PushTrackingController(store, mock(AnalyticsEventService.class), disabled, clock)
                .displayed(token.token());
        assertThat(file).exists();

        Files.delete(file);
        new BannerNotificationService(disabled, store, mock(WebPushSender.class),
                mock(PushMessageFactory.class), mock(BannerCatalog.class), clock).onReload(List.of());
        assertThat(file).exists();
    }

    @Test
    void subscribeAndSchedulerDoNotWriteWhenDisabled() {
        var request = new PushSubscriptionController.SubscriptionRequest(
                "https://fcm.googleapis.com/x", new PushSubscriptionController.Keys("k", "a"), "v", true);
        var response = new PushSubscriptionController(disabled, store).subscribe(request);
        assertThat(response.getStatusCode().value()).isEqualTo(503);

        new NewOfferNotificationService(disabled, store, mock(WebPushSender.class),
                mock(PushMessageFactory.class), mock(BrandComparisonService.class), clock).sendDueOffer();

        assertThat(file).doesNotExist();
    }
}
