package com.discounttracker.push;

import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import org.jose4j.lang.JoseException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.concurrent.ExecutionException;

@Component
public class WebPushSender {
    private final PushProperties properties;

    public WebPushSender(PushProperties properties) {
        this.properties = properties;
    }

    public int send(PushSubscription subscription, String payload) {
        if (!properties.configured()) return 0;
        if (!PushEndpointPolicy.isAllowed(subscription.endpoint())) {
            throw new IllegalArgumentException("허용되지 않은 Push endpoint");
        }
        try {
            PushService service = new PushService(properties.publicKey(), properties.privateKey(),
                    properties.subject());
            return service.send(new Notification(subscription.endpoint(), subscription.p256dh(),
                    subscription.auth(), payload)).getStatusLine().getStatusCode();
        } catch (GeneralSecurityException | IOException | JoseException
                 | ExecutionException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new IllegalStateException("Web Push 전송 실패", e);
        }
    }
}
