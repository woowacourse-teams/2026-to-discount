package com.discounttracker.analytics;

import java.time.Duration;
import java.time.Instant;

/** pending/dead-letter 파일에 저장하는 payload와 전달 상태. */
public record PostHogDelivery(
        String eventId,
        PostHogEvent payload,
        int attemptCount,
        long nextAttemptAtEpochMs,
        String lastError,
        Long failedAtEpochMs
) {
    static final int MAX_ATTEMPTS = 5;
    static final Duration RETRY_INTERVAL = Duration.ofHours(1);

    static PostHogDelivery pending(String eventId, PostHogEvent payload, Instant now) {
        return new PostHogDelivery(eventId, payload, 0, now.toEpochMilli(), null, null);
    }

    PostHogDelivery withPayload(PostHogEvent nextPayload) {
        return new PostHogDelivery(eventId, nextPayload, attemptCount,
                nextAttemptAtEpochMs, lastError, failedAtEpochMs);
    }

    boolean due(Instant now) {
        return nextAttemptAtEpochMs <= now.toEpochMilli();
    }

    PostHogDelivery claim(Instant now) {
        return new PostHogDelivery(eventId, payload, attemptCount + 1,
                now.plus(RETRY_INTERVAL).toEpochMilli(), lastError, null);
    }

    PostHogDelivery failed(String error, Instant now) {
        Long failedAt = attemptCount >= MAX_ATTEMPTS ? now.toEpochMilli() : null;
        return new PostHogDelivery(eventId, payload, attemptCount,
                nextAttemptAtEpochMs, error, failedAt);
    }
}
