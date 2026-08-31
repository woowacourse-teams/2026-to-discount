package com.discounttracker.analytics;

import java.util.Map;

/** PostHog ingestion API가 받는 이벤트 한 건. */
public record PostHogEvent(
        String uuid,
        String event,
        Map<String, Object> properties,
        String timestamp
) {
}
