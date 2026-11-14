package com.discounttracker.analytics;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

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

    static final int READS_PER_MINUTE = 10;
    static final int MINE_LIMIT = 50;
    private static final Pattern VISITOR_ID = Pattern.compile("^v_[0-9a-f]{16}$");

    private final SlackReporter slack;
    private final ClientFingerprint fingerprint;
    private final ReportLedger ledger;
    private final ObjectMapper mapper;
    private final ReportRateLimiter writes = new ReportRateLimiter(PER_MINUTE, PER_DAY);
    private final ReportRateLimiter reads = new ReportRateLimiter(READS_PER_MINUTE, Integer.MAX_VALUE);

    public ReportController(SlackReporter slack, ClientFingerprint fingerprint, ObjectMapper mapper,
                            ReportLedger ledger) {
        this.slack = slack;
        this.fingerprint = fingerprint;
        this.mapper = mapper;
        this.ledger = ledger;
    }

    /** 이 브라우저의 제보 목록(본문 없음). 응답 키 집합은 이 함수에서만 정한다. */
    @GetMapping("/mine")
    public ResponseEntity<Map<String, Object>> mine(
            @RequestHeader(value = "X-Visitor-Id", required = false) String visitorId, HttpServletRequest request) {
        if (visitorId == null || !VISITOR_ID.matcher(visitorId).matches()) {
            return ResponseEntity.badRequest().body(Map.of("ok", false));
        }
        if (!reads.allow(fingerprint.hashForLimit(request), Instant.now())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of("ok", false));
        }
        try {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (ReportLedger.Entry e : ledger.mine(visitorId, MINE_LIMIT)) rows.add(mineRow(e));
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("reports", rows));
        } catch (IOException e) {
            // 상태 파일을 못 읽었을 때 전부 received로 내지 않는다. 웹은 ok:false면 영역을 그리지 않는다.
            log.error("reports unreadable", e);
            return ResponseEntity.internalServerError().cacheControl(CacheControl.noStore()).body(Map.of("ok", false));
        }
    }

    static Map<String, Object> mineRow(ReportLedger.Entry e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.id());
        m.put("at", e.rawAt());
        m.put("type", type(e));
        m.put("brand", dashToNull(e.text("brand")));
        m.put("status", e.status());
        return m;
    }

    /** 운영자용: 본문까지. visitorId, client, url, filters는 싣지 않는다. */
    static Map<String, Object> adminRow(ReportLedger.Entry e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", e.id());
        m.put("at", e.rawAt());
        m.put("type", type(e));
        m.put("platform", dashToNull(e.text("platform")));
        m.put("brand", dashToNull(e.text("brand")));
        m.put("text", e.text("text"));
        m.put("status", e.status());
        return m;
    }

    private static String type(ReportLedger.Entry e) {
        String t = e.text("type");
        return t != null && TYPES.containsKey(t) ? t : null;
    }

    private static String dashToNull(String s) {
        return s == null || s.equals("-") ? null : s;
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
        String who = fingerprint.hashForLimit(request);
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
        String id;
        try {
            id = ledger.append(mapper.writeValueAsString(row));
        } catch (IOException | RuntimeException e) {
            // 저장을 못 하면 성공이라 하지 않는다. 슬랙에는 그래도 띄워 잃지 않게 한다.
            log.error("report not saved: {} / {}", e.toString(), message.replace('\n', ' '));
            slack.send(message);
            return ResponseEntity.internalServerError().body(Map.of("ok", false));
        }
        if (!slack.send(message + "\n번호: " + id)) log.warn("report saved but not delivered to slack");
        return ResponseEntity.ok(Map.of("ok", true));
    }

    boolean allow(String key, Instant now) {
        return writes.allow(key, now);
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
