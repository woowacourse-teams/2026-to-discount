package com.discounttracker.analytics;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 방문 이벤트 수집. 브라우저가 배치로 보내고 서버는 받아 적기만 한다.
 *
 * <p>인증이 없는 공개 쓰기 엔드포인트라 들어오는 값을 그대로 믿지 않는다 —
 * 이벤트 이름은 화이트리스트, 문자열은 길이 제한, 배치는 건수 제한,
 * 그리고 IP 해시별 분당 허용량을 건다.
 */
@RestController
@RequestMapping("/api")
public class EventController {

    /**
     * 프론트가 실제로 보내는 것만 받는다. 모르는 이름은 조용히 버린다.
     *
     * <p>조용히 버리는 대신 목록을 프론트와 맞춰야 한다. 필터 시트와
     * 담아보기 화면을 올린 뒤 여섯 종이 여기 없어서, 서버가 받자마자
     * 버리고 있었다 — 정작 A/B가 답하려는 질문(조건을 설정한 사람이
     * 링크 이동까지 가는가)이 그 이벤트들에 걸려 있었다.
     */
    private static final Set<String> ALLOWED_EVENTS = Set.of(
            "page_view", "page_exit", "category_change", "brand_expand",
            "offer_link_click", "banner_click", "platform_filter_toggle", "filters_reset",
            "brands_retry", "scroll_to_top", "membership_toggle", "filters_apply",
            "cart_toggle", "filter_sheet_open", "cart_view_toggle", "cart_clear",
            "banner_impression", "banner_dismiss");

    private static final int MAX_BATCH = 20;
    private static final int MAX_TEXT = 120;
    private static final Pattern VARIANT_TOKEN = Pattern.compile("[a-z0-9_-]{1,16}");
    // 필터 맥락 4종(fCategory, fPlatforms, fSort, fSearch)이 모든 이벤트에
    // 붙는다. 6이면 이벤트 자신의 값을 두 개밖에 못 싣는데, banner_click은
    // 네 개(banner, brand, platform, position)를 싣는다. 둘 다 들어가는
    // 크기로 올린다. 순서는 프론트가 이벤트 값을 앞에 두므로, 그래도
    // 넘치면 맥락이 먼저 떨어진다.
    private static final int MAX_PROPS = 8;

    private final AnalyticsEventService events;
    private final ClientFingerprint fingerprint;
    private final EventRateLimiter limiter;
    private final ObjectMapper mapper;

    public EventController(AnalyticsEventService events, ClientFingerprint fingerprint,
                           EventRateLimiter limiter, ObjectMapper mapper) {
        this.events = events;
        this.fingerprint = fingerprint;
        this.limiter = limiter;
        this.mapper = mapper;
    }

    /** 깨진 본문은 던지지 않고 빈 목록으로 본다 — 공개 엔드포인트라 요란할 필요가 없다. */
    private List<IncomingEvent> parse(String body) {
        if (body == null || body.isBlank()) return List.of();
        try {
            List<IncomingEvent> parsed = mapper.readValue(body, new TypeReference<>() {});
            return parsed == null ? List.of() : parsed;
        } catch (IOException e) {
            return List.of();
        }
    }

    /**
     * 본문을 {@code List<IncomingEvent>}로 바로 안 받고 문자열로 받아 직접
     * 파싱한다. 이탈 시점 전송은 {@code navigator.sendBeacon}을 쓰는데,
     * 비콘이 프리플라이트를 못 해서 {@code text/plain}으로 와야 하기 때문이다
     * (application/json이면 프리플라이트가 걸려 조용히 유실된다). 그래서
     * 같은 엔드포인트가 json과 text/plain을 모두 받아야 한다.
     */
    @PostMapping("/events")
    public ResponseEntity<Map<String, Integer>> collect(
            @RequestBody(required = false) String body, HttpServletRequest request) {

        List<IncomingEvent> batch = parse(body);
        if (batch.isEmpty()) {
            return ResponseEntity.ok(Map.of("accepted", 0));
        }
        List<IncomingEvent> capped = batch.size() > MAX_BATCH ? batch.subList(0, MAX_BATCH) : batch;

        String ipHash = fingerprint.hash(request);
        if (!limiter.tryConsume(ipHash, capped.size())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }

        String now = OffsetDateTime.now().toString();
        List<VisitEvent> accepted = new ArrayList<>();
        for (IncomingEvent in : capped) {
            if (in == null || !ALLOWED_EVENTS.contains(in.event())) continue;
            accepted.add(new VisitEvent(
                    now,
                    in.event(),
                    trim(in.visitorId()),
                    trim(in.sessionId()),
                    in.visitCount(),
                    trim(in.path()),
                    trim(in.referrer()),
                    trim(in.device()),
                    trim(in.viewport()),
                    in.dwellMs(),
                    trimProps(in.props()),
                    trim(in.clientTs()),
                    ipHash,
                    in.dev(),
                    variant(in.variant()),
                    eventId(in.eventId())));
        }
        events.append(accepted);
        return ResponseEntity.ok(Map.of("accepted", accepted.size()));
    }

    // 실험 갈래는 짧은 토큰만 받는다. 자유 문자열로 열어두면 아무 값이나
    // 섞여 들어와 나중에 갈래별로 가를 때 무엇이 진짜 갈래인지 알 수 없다.
    // 갈래가 늘 때마다 서버를 고치지 않도록 목록 대신 모양으로 거른다.
    private static String variant(String v) {
        if (v == null) return null;
        String t = v.trim();
        return VARIANT_TOKEN.matcher(t).matches() ? t : null;
    }

    private static String trim(String v) {
        if (v == null) return null;
        return v.length() <= MAX_TEXT ? v : v.substring(0, MAX_TEXT);
    }

    private static Map<String, String> trimProps(Map<String, String> props) {
        if (props == null || props.isEmpty()) return null;
        Map<String, String> out = new java.util.LinkedHashMap<>();
        for (var e : props.entrySet()) {
            if (out.size() >= MAX_PROPS) break;
            out.put(trim(e.getKey()), trim(e.getValue()));
        }
        return out;
    }

    /** 유효한 클라이언트 UUID는 재전송에도 유지하고, 구버전·잘못된 값만 서버가 보완한다. */
    private static String eventId(String value) {
        if (value != null) {
            String candidate = value.trim();
            if (candidate.length() == 36) {
                try {
                    UUID parsed = UUID.fromString(candidate);
                    if (parsed.toString().equalsIgnoreCase(candidate)) return candidate;
                } catch (IllegalArgumentException ignored) {
                    // 공개 엔드포인트이므로 잘못된 값은 요청 실패 대신 서버 UUID로 대체한다.
                }
            }
        }
        return UUID.randomUUID().toString();
    }

    /** 클라이언트가 보내는 모양. 서버가 얹는 ts·ipHash는 여기 없다. */
    public record IncomingEvent(
            String event,
            String visitorId,
            String sessionId,
            Integer visitCount,
            String path,
            String referrer,
            String device,
            String viewport,
            Long dwellMs,
            Map<String, String> props,
            String clientTs,
            Boolean dev,
            String variant,
            String eventId
    ) {
    }
}
