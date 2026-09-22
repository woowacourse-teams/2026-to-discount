package com.discounttracker.push;

import com.discounttracker.banner.Banner;
import com.discounttracker.banner.BannerCatalog;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.bouncycastle.jce.interfaces.ECPrivateKey;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Security;
import java.security.spec.ECGenParameterSpec;
import java.time.Clock;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;
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
    void preparesEncryptedRequestWithRuntimeCryptoDependencies() {
        Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME);
        new WebPushSender(properties());
        assertThat(Security.getProvider(BouncyCastleProvider.PROVIDER_NAME)).isNotNull();

        assertThatCode(() -> {
            KeyPair vapid = keyPair();
            KeyPair browser = keyPair();
            PushProperties properties = new PushProperties(true, publicKey(vapid), privateKey(vapid),
                    "mailto:test@example.com", Path.of("unused"), "https://front.example/",
                    "https://api.example");
            PushService service = new WebPushSender(properties).createService();
            Notification notification = new Notification("https://fcm.googleapis.com/fcm/send/test",
                    publicKey(browser), base64Url(new byte[16]), "payload");

            var request = service.preparePost(notification, Encoding.AES128GCM);

            assertThat(request.getFirstHeader("Authorization")).isNotNull();
            assertThat(request.getFirstHeader("Content-Encoding").getValue()).isEqualTo("aes128gcm");
            assertThat(request.getEntity().getContentLength()).isPositive();
        }).doesNotThrowAnyException();
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

    private KeyPair keyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("ECDH", "BC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }

    private String publicKey(KeyPair pair) {
        return base64Url(((ECPublicKey) pair.getPublic()).getQ().getEncoded(false));
    }

    private String privateKey(KeyPair pair) {
        byte[] encoded = ((ECPrivateKey) pair.getPrivate()).getD().toByteArray();
        if (encoded.length > 32) encoded = Arrays.copyOfRange(encoded, encoded.length - 32, encoded.length);
        if (encoded.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(encoded, 0, padded, 32 - encoded.length, encoded.length);
            encoded = padded;
        }
        return base64Url(encoded);
    }

    private String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private PushProperties properties() {
        return new PushProperties(true, "public", "private", "mailto:test@example.com",
                Path.of("unused"), "https://front.example/", "https://api.example");
    }
}
