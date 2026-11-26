package com.discounttracker.push;

import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.jose4j.lang.JoseException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.Security;
import java.time.Duration;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.http.HttpResponse;

@Component
public class WebPushSender {
    private final PushProperties properties;

    public WebPushSender(PushProperties properties) {
        registerBouncyCastle();
        this.properties = properties;
    }

    private static void registerBouncyCastle() {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    /** 엔드포인트 하나가 답하지 않아도 발송 전체가 멈추지 않게 한 건에 거는 상한. */
    static final Duration SEND_TIMEOUT = Duration.ofSeconds(10);

    // 키를 읽어 만든 서비스는 재시작 전까지 바뀌지 않는다. 만들다 실패한 것도 기억한다(키가 틀리면 재시작해야 고쳐진다).
    private PushService service;
    private RuntimeException serviceError;

    private synchronized PushService service() {
        if (service == null && serviceError == null) {
            try {
                service = createService();
            } catch (GeneralSecurityException | RuntimeException e) {
                serviceError = new IllegalStateException("Web Push 서비스를 만들지 못함", e);
            }
        }
        if (serviceError != null) throw serviceError;
        return service;
    }

    PushService createService() throws GeneralSecurityException {
        return new PushService(properties.publicKey(), properties.privateKey(),
                properties.subject());
    }

    public int send(PushSubscription subscription, String payload) {
        if (!properties.configured()) return 0;
        if (!PushEndpointPolicy.isAllowed(subscription.endpoint())) {
            throw new IllegalArgumentException("허용되지 않은 Push endpoint");
        }
        PushService push = service();
        Future<HttpResponse> pending = null;
        try {
            pending = push.sendAsync(new Notification(subscription.endpoint(), subscription.p256dh(),
                    subscription.auth(), payload));
            return pending.get(SEND_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS).getStatusLine().getStatusCode();
        } catch (GeneralSecurityException | IOException | JoseException
                 | ExecutionException | InterruptedException | TimeoutException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            // 취소하면 라이브러리가 호출마다 만든 HTTP 클라이언트를 닫는다.
            if (pending != null) pending.cancel(true);
            throw new IllegalStateException("Web Push 전송 실패", e);
        }
    }
}
