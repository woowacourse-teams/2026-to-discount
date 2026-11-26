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
