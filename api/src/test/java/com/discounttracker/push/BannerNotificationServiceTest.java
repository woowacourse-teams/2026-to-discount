package com.discounttracker.push;

import com.discounttracker.banner.Banner;
import com.discounttracker.banner.BannerCatalog;
import nl.martijndwars.webpush.PushService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

class BannerNotificationServiceTest {

    @Test
    void loadsRuntimeDependenciesWhenCreatingPushService() {
        assertThatCode(PushService::new).doesNotThrowAnyException();
    }

    @Test
    void leavesActivationPendingWhenOnlySomeSubscriptionsComplete() {
        PushStateStore store = mock(PushStateStore.class);
        WebPushSender sender = mock(WebPushSender.class);
        PushMessageFactory messages = mock(PushMessageFactory.class);
        BannerCatalog catalog = mock(BannerCatalog.class);
        Banner banner = mock(Banner.class);
        BannerNotificationState activation = new BannerNotificationState(
                "banner", true, "activation", Clock.systemUTC().instant(), true, null, null);
        PushSubscription first = subscription("first");
        PushSubscription second = subscription("second");

        when(banner.id()).thenReturn("banner");
        when(banner.notificationEnabled()).thenReturn(true);
        when(catalog.all()).thenReturn(List.of(banner));
        when(store.activeSubscriptions()).thenReturn(List.of(first, second));
        when(store.createToken(any(), any(), any(), any())).thenReturn(
                new PushTrackingToken("token", "notification", "first", List.of("banner"),
                        "immediate", Clock.systemUTC().instant().plusSeconds(60), false, false));
        when(messages.payload(any(), any(), any(), any(), any())).thenReturn("payload");
        when(sender.send(any(), any())).thenReturn(201, 500);

        BannerNotificationService service = new BannerNotificationService(properties(), store,
                sender, messages, catalog, Clock.systemUTC());

        assertThat(service.dispatch(List.of(activation), "immediate")).isEqualTo(1);
        verify(store, never()).markDispatched(any(), any());
    }

    @Test
    void doesNotResendSuccessfulImmediateDeliveryInDigestRecovery() {
        PushStateStore store = mock(PushStateStore.class);
        WebPushSender sender = mock(WebPushSender.class);
        PushMessageFactory messages = mock(PushMessageFactory.class);
        BannerCatalog catalog = mock(BannerCatalog.class);
        Banner banner = mock(Banner.class);
        BannerNotificationState activation = new BannerNotificationState(
                "banner", true, "activation", Clock.systemUTC().instant(), true, null, null);

        when(banner.id()).thenReturn("banner");
        when(banner.notificationEnabled()).thenReturn(true);
        when(catalog.all()).thenReturn(List.of(banner));
        when(store.activeSubscriptions()).thenReturn(List.of(subscription("first")));
        when(store.wasDelivered("activation:first")).thenReturn(false, true);
        when(store.createToken(any(), any(), any(), any())).thenReturn(
                new PushTrackingToken("token", "notification", "first", List.of("banner"),
                        "immediate", Clock.systemUTC().instant().plusSeconds(60), false, false));
        when(messages.payload(any(), any(), any(), any(), any())).thenReturn("payload");
        when(sender.send(any(), any())).thenReturn(201);
        BannerNotificationService service = new BannerNotificationService(properties(), store,
                sender, messages, catalog, Clock.systemUTC());

        service.dispatch(List.of(activation), "immediate");
        service.dispatch(List.of(activation), "digest");

        verify(sender, times(1)).send(any(), any());
    }

    @Test
    void reusesNotificationIdWhenAnUnrecordedDeliveryIsRetried() {
        PushStateStore store = mock(PushStateStore.class);
        WebPushSender sender = mock(WebPushSender.class);
        PushMessageFactory messages = mock(PushMessageFactory.class);
        BannerCatalog catalog = mock(BannerCatalog.class);
        Banner banner = mock(Banner.class);
        BannerNotificationState activation = new BannerNotificationState(
                "banner", true, "activation", Clock.systemUTC().instant(), true, null, null);

        when(banner.id()).thenReturn("banner");
        when(banner.notificationEnabled()).thenReturn(true);
        when(catalog.all()).thenReturn(List.of(banner));
        when(store.activeSubscriptions()).thenReturn(List.of(subscription("first")));
        when(store.createToken(any(), any(), any(), any())).thenReturn(
                new PushTrackingToken("token", "notification", "first", List.of("banner"),
                        "immediate", Clock.systemUTC().instant().plusSeconds(60), false, false));
        when(messages.payload(any(), any(), any(), any(), any())).thenReturn("payload");
        when(sender.send(any(), any())).thenReturn(201);
        BannerNotificationService service = new BannerNotificationService(properties(), store,
                sender, messages, catalog, Clock.systemUTC());

        service.dispatch(List.of(activation), "immediate");
        service.dispatch(List.of(activation), "immediate");

        ArgumentCaptor<String> ids = ArgumentCaptor.forClass(String.class);
        verify(messages, org.mockito.Mockito.times(2))
                .payload(any(), any(), any(), ids.capture(), any());
        assertThat(ids.getAllValues()).containsExactly(ids.getAllValues().get(0), ids.getAllValues().get(0));
    }

    private PushSubscription subscription(String id) {
        var now = Clock.systemUTC().instant();
        return new PushSubscription(id, "https://push.example/" + id, "key", "auth",
                "visitor", true, now, now, true);
    }

    private PushProperties properties() {
        return new PushProperties(true, "public", "private", "mailto:test@example.com",
                Path.of("unused"), "https://front.example/", "https://api.example");
    }
}
