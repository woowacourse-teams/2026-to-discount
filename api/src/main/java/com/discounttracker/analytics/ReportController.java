package com.discounttracker.analytics;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.beans.factory.annotation.Value;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.LinkedHashMap;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "잘못된 정보 제보" 접수. 받은 글은 슬랙으로 보내고, 슬랙이 없거나 실패해도
 * 로그에 남기고 사용자에게는 성공을 준다(제보는 잃지 않는 게 먼저다).
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private static final Logger log = LoggerFactory.getLogger(ReportController.class);

    /** 웹 report.js REPORT_TYPES와 같은 키. 값은 슬랙에 보이는 이름. */
    static final Map<String, String> TYPES = Map.of(
            "amount", "할인 금액", "exists", "할인 여부", "screen", "화면 오류", "other", "그 외");
    /** 웹 platforms.js PLATFORMS 키. */
    static final java.util.Set<String> PLATFORMS = java.util.Set.of("baemin", "coupangeats", "ddangyo", "yogiyo");
    static final int MAX_TEXT = 500;
    static final int MAX_SHORT = 100;
    static final int MAX_URL = 500;
    static final int PER_MINUTE = 3;
    static final int PER_DAY = 20;

    private final SlackReporter slack;
    private final ClientFingerprint fingerprint;
    // ponytail: 메모리 카운터, EventRateLimiter와 같은 한계(재시작 초기화, 인스턴스 한 대).
    private final Map<String, Deque<Instant>> recent = new ConcurrentHashMap<>();

    private final ObjectMapper mapper;
    private final Path reportPath;

    public ReportController(SlackReporter slack, ClientFingerprint fingerprint, ObjectMapper mapper,
                            @Value("${discount.report.path:data/reports.jsonl}") String reportPath) {
        this.slack = slack;
        this.fingerprint = fingerprint;
        this.mapper = mapper;
        this.reportPath = Path.of(reportPath);
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> submit(@RequestBody(required = false) Report body,
                                                      HttpServletRequest request) {
        String text = body == null || body.text() == null ? "" : body.text().strip();
        if (text.isEmpty() || body.type() == null || !TYPES.containsKey(body.type())
                || (body.platform() != null && !body.platform().isEmpty() && !PLATFORMS.contains(body.platform())) || text.length() > MAX_TEXT
                || tooLong(body.brand(), MAX_SHORT) || tooLong(body.url(), MAX_URL)
                || tooLong(body.filters(), MAX_URL) || tooLong(body.visitorId(), MAX_SHORT)) {
            return ResponseEntity.badRequest().body(Map.of("ok", false));
        }
        String who = fingerprint.hash(request);
        if (!allow(who, Instant.now())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("ok", false));
        }

        String message = "[제보/" + TYPES.get(body.type()) + "] " + text
                + "\n앱: " + orDash(body.platform())
                + "\n브랜드: " + orDash(body.brand())
                + "\n화면: " + orDash(body.url())
                + "\n필터: " + orDash(body.filters())
                + "\n방문자: " + orDash(body.visitorId()) + " / " + who;
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("at", Instant.now().toString());
        row.put("type", body.type());
        row.put("platform", orDash(body.platform()));
        row.put("text", text);
        row.put("brand", orDash(body.brand()));
        row.put("url", orDash(body.url()));
        row.put("filters", orDash(body.filters()));
        row.put("visitorId", orDash(body.visitorId()));
        row.put("client", who);
        try {
            append(mapper.writeValueAsString(row));
        } catch (IOException | RuntimeException e) {
            // 저장을 못 하면 성공이라 하지 않는다. 슬랙에는 그래도 띄워 잃지 않게 한다.
            log.error("report not saved: {} / {}", e.toString(), message.replace('\n', ' '));
            slack.send(message);
            return ResponseEntity.internalServerError().body(Map.of("ok", false));
        }
        if (!slack.send(message)) log.warn("report saved but not delivered to slack");
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private synchronized void append(String line) throws IOException {
        Path parent = reportPath.toAbsolutePath().getParent();
        if (parent != null) Files.createDirectories(parent);
        Files.writeString(reportPath, line + "\n", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    synchronized boolean allow(String key, Instant now) {
        if (recent.size() > 10_000) recent.clear();
        Deque<Instant> times = recent.computeIfAbsent(key, k -> new ArrayDeque<>());
        while (!times.isEmpty() && times.peekFirst().isBefore(now.minus(Duration.ofDays(1)))) {
            times.pollFirst();
        }
        long lastMinute = times.stream().filter(t -> t.isAfter(now.minus(Duration.ofMinutes(1)))).count();
        if (times.size() >= PER_DAY || lastMinute >= PER_MINUTE) return false;
        times.addLast(now);
        return true;
    }

    private static boolean tooLong(String s, int max) {
        return s != null && s.length() > max;
    }

    private static String orDash(String s) {
        return s == null || s.isBlank() ? "-" : s.strip();
    }

    public record Report(String type, String platform, String text, String brand, String url, String filters, String visitorId) {
    }
}
