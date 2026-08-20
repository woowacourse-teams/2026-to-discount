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

    /**
     * 이 폭 미만이면서 desktop이면 개발 트래픽으로 본다. 400px은 가장 넓은
     * 흔한 폰(430px)보다 아래라 실기기와 겹치지 않는다.
     */
    private static final int DEV_SUSPECT_MAX_WIDTH = 400;

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
        put(properties, "variant", source.variant());
        if (looksLikeDeveloper(source)) properties.put("dev_suspect", true);
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

    /**
     * 표시가 안 붙은 개발 트래픽으로 보이는지.
     *
     * <p>{@code ?dev=1}로 켜는 표시는 localStorage에 남아 브라우저·프로필·
     * 시크릿창마다 따로 잡힌다. 기기가 여럿이면 일부만 걸리고 나머지는 그대로
     * 섞여 들어온다 — 실측으로 방문자 43명 중 8명(19%)이 그렇게 새고 있었다.
     *
     * <p>{@code device}는 프론트가 {@code matchMedia('(hover: hover)')}로 정한다.
     * desktop인데 뷰포트 폭이 좁으면 데스크톱 브라우저 창을 줄여 놓은 것, 곧
     * 반응형 확인이다. 실제 사용자에게는 거의 안 나오는 조합이다.
     *
     * <p>거르지 않고 표시만 남긴다. 무엇이 개발 트래픽인지는 나중에 바뀔 수
     * 있는 판단이라, 안 보내버리면 되돌릴 수 없다. PostHog에서는 이 속성으로
     * 필터한다. 자체 원장은 원본을 그대로 갖고 있어 집계할 때 같은 규칙을
     * 다시 적용한다(scripts/ab_report.sh).
     */
    private static boolean looksLikeDeveloper(VisitEvent source) {
        if (!"desktop".equals(source.device())) return false;
        int width = viewportWidth(source.viewport());
        // 폭을 못 읽었으면(0) 모르는 것이지 좁은 것이 아니다 — 모르는 것을
        // 개발 트래픽으로 몰면 실사용자가 조용히 빠진다.
        return width > 0 && width < DEV_SUSPECT_MAX_WIDTH;
    }

    /** {@code "390x844"}에서 앞 숫자. 못 읽으면 0(모름). */
    private static int viewportWidth(String viewport) {
        if (viewport == null) return 0;
        int x = viewport.indexOf('x');
        if (x <= 0) return 0;
        try {
            return Integer.parseInt(viewport.substring(0, x).trim());
        } catch (NumberFormatException ex) {
            return 0;
        }
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
