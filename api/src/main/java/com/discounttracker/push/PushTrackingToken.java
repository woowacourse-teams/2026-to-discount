package com.discounttracker.push;

import java.time.Instant;
import java.util.List;

public record PushTrackingToken(
        String token,
        String notificationId,
        String subscriptionId,
        List<String> bannerIds,
        String deliveryType,
        Instant expiresAt,
        boolean displayed,
        boolean clicked) {
}
