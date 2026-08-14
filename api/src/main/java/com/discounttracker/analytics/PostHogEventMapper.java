package com.discounttracker.analytics;

import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** 자체 이벤트를 기존 historical import와 같은 PostHog 모양으로 바꾼다. */
@Component
public class PostHogEventMapper {

    private final Clock clock;

    public PostHogEventMapper(Clock clock) {
        this.clock = clock;
    }

    public Optional<PostHogEvent> map(VisitEvent source) {
        if (source == null || Boolean.TRUE.equals(source.dev())) return Optional.empty();
        if (blank(source.eventId()) || blank(source.visitorId())) return Optional.empty();

        Map<String, Object> properties = new LinkedHashMap<>();
        if (source.props() != null) {
            source.props().forEach((key, value) -> {
                if (!blank(key) && value != null) properties.put(key, value);
            });
        }

        // 서버가 책임지는 키는 클라이언트 props가 덮어쓸 수 없다.
        properties.put("distinct_id", source.visitorId());
        put(properties, "source_session_id", source.sessionId());
        put(properties, "visit_count", source.visitCount());
        put(properties, "path", source.path());
        put(properties, "referrer", source.referrer());
        put(properties, "device", source.device());
        put(properties, "viewport", source.viewport());
        put(properties, "dwell_ms", source.dwellMs());
        put(properties, "server_timestamp", source.ts());
        properties.put("$insert_id", source.eventId());

        String eventName = "page_view".equals(source.event()) ? "$pageview" : source.event();
        String timestamp = timestamp(source.ts());
        return Optional.of(new PostHogEvent(
                eventName,
                Collections.unmodifiableMap(new LinkedHashMap<>(properties)),
                timestamp));
    }

    private String timestamp(String serverTimestamp) {
        Instant parsed = parse(serverTimestamp);
        return (parsed == null ? clock.instant() : parsed).toString();
    }

    private static Instant parse(String value) {
        if (blank(value)) return null;
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            try {
                return OffsetDateTime.parse(value).toInstant();
            } catch (DateTimeParseException alsoIgnored) {
                return null;
            }
        }
    }

    private static void put(Map<String, Object> target, String key, Object value) {
        if (value != null) target.put(key, value);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
