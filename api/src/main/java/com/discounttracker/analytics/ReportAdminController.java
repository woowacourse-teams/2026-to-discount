package com.discounttracker.analytics;

import com.discounttracker.web.OpsAuth;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 운영 콘솔이 쓰는 제보 관리 엔드포인트(설계 393). 공개 API가 아니다.
 * 인증은 {@link OpsAuth}: Nginx가 Basic Auth를 통과시킨 요청에만 붙이는 표시를 루프백에서 받을 때만 믿는다.
 */
@RestController
@RequestMapping("/api/admin/reports")
public class ReportAdminController {

    private static final Logger log = LoggerFactory.getLogger(ReportAdminController.class);
    private static final Pattern REPORT_ID = Pattern.compile("^r_[0-9a-f]{16}$");
    private static final int LIST_LIMIT = 100;

    private final ReportLedger ledger;

    public ReportAdminController(ReportLedger ledger) {
        this.ledger = ledger;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list(HttpServletRequest request) {
        OpsAuth.require(request);
        try {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (ReportLedger.Entry e : ledger.recent(LIST_LIMIT)) rows.add(ReportController.adminRow(e));
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("reports", rows));
        } catch (IOException e) {
            return failed(e);
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> put(HttpServletRequest request, @PathVariable String id,
                                                    @RequestBody(required = false) JsonNode body) {
        OpsAuth.require(request);
        String by = OpsAuth.user(request);
        JsonNode s = body == null ? null : body.get("status");
        if (!REPORT_ID.matcher(id).matches() || s == null || !s.isString()
                || !ReportLedger.STATUSES.contains(s.asString())) {
            return ResponseEntity.badRequest().body(Map.of("ok", false));
        }
        try {
            Optional<ReportLedger.Entry> done = ledger.setStatus(id, s.asString(), by);
            if (done.isEmpty()) return ResponseEntity.status(404).body(Map.of("ok", false));
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ReportController.adminRow(done.get()));
        } catch (IOException e) {
            return failed(e);
        }
    }

    private static ResponseEntity<Map<String, Object>> failed(IOException e) {
        log.error("reports unreadable or unwritable", e);
        return ResponseEntity.internalServerError().body(Map.of("ok", false));
    }
}
