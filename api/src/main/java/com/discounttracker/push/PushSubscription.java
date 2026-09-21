package com.discounttracker.push;

import java.time.Instant;

public record PushSubscription(
        String id,
        String endpoint,
        String p256dh,
        String auth,
        String visitorId,
        boolean analyticsEnabled,
        Instant createdAt,
        Instant updatedAt,
        boolean active) {
}
