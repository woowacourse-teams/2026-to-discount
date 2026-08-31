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
                // 설문 자유 입력은 밖으로 안 보낸다. 원장에는 거른 뒤 남기지만,
                // 제3자 도구로 넘기는 것은 스펙이 정한 개인정보 처리 범위 밖이다.
                if ("survey_answer".equals(source.event()) && "text".equals(key)) return;
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
        put(properties, "variant", source.variant());
        put(properties, "viewport", source.viewport());
        put(properties, "dwell_ms", source.dwellMs());
        put(properties, "server_timestamp", source.ts());
        properties.put("$insert_id", source.eventId());

        String eventName = "page_view".equals(source.event()) ? "$pageview" : source.event();
        String timestamp = timestamp(source.ts());
        return Optional.of(new PostHogEvent(
                source.eventId(),
                eventName,
                Collections.unmodifiableMap(new LinkedHashMap<>(properties)),
                timestamp));
    }

    /*
     * 개발 트래픽 추정은 여기서 하지 않는다.
     *
     * 예전에는 desktop이면서 폭 400px 미만이면 dev_suspect를 붙였다. 그
     * 규칙이 안드로이드 폰 사용자 368명을 개발자로 몰아냈다 — device를
     * 프론트가 matchMedia('(hover: hover)')로 정하는데 일부 안드로이드
     * 브라우저가 hover:hover를 보고하기 때문이다. 걸러낸 무리의 전환율이
     * 남은 쪽보다 높았던 것이 단서였다.
     *
     * 개발 트래픽은 세션 전체를 봐야 갈린다: 진짜 개발자는 한 세션 안에서
     * 창 크기를 바꿔 가며 본다(폭 [390, 1280]), 폰은 세션 내내 폭이 하나다.
     * 이벤트 하나만 보는 여기서는 알 수 없는 판단이라 원장을 통째로 읽는
     * scripts/experiments.py 한 곳에만 둔다. 명시 표시(?dev=1)는 위 map()
     * 첫 줄에서 그대로 걸러 PostHog로 안 보낸다.
     */


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
