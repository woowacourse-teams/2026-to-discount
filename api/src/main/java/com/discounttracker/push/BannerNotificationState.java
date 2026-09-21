package com.discounttracker.push;

import java.time.Instant;

public record BannerNotificationState(
        String bannerId,
        boolean lastNotify,
        String activationId,
        Instant activatedAt,
        boolean immediateRequested,
        Instant immediateDispatchedAt,
        Instant digestDispatchedAt) {
}
