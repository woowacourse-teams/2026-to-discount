package com.discounttracker.analytics;

import com.discounttracker.web.OpsAuth;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * 운영 콘솔의 설문 카드가 쓰는 관리자 엔드포인트(설계 317). 공개 API가 아니다.
 * 인증은 {@link OpsAuth}: Nginx가 Basic Auth를 통과시킨 요청에만 붙이는 표시를 루프백에서 받을 때만 믿는다.
 */
@RestController
@RequestMapping("/api/admin/survey-settings")
public class SurveyAdminController {

    private static final Logger log = LoggerFactory.getLogger(SurveyAdminController.class);

    private final SurveySettings settings;
    private final SurveyService survey;
    private final GifticonStore gifticons;

    public SurveyAdminController(SurveySettings settings, SurveyService survey, GifticonStore gifticons) {
        this.settings = settings;
        this.survey = survey;
        this.gifticons = gifticons;
    }

    public record AudienceView(Integer eligible, Integer visitors, String ledger) {}

    public record View(SurveySettings.Values settings, String source, String problem, String version,
                       GifticonStore.Stock stock, AudienceView audience) {}

    public record Excluded(int answered, int dev) {}

    public record Preview(Integer eligible, Integer visitors, Excluded excluded, String ledger, String asOf) {}

    @GetMapping
    public View get(HttpServletRequest request) {
        OpsAuth.require(request);
        return view(settings.current());
    }

    @GetMapping("/preview")
    public Preview preview(HttpServletRequest request,
                           @RequestParam(required = false) String minDays,
                           @RequestParam(required = false) String minConversions,
                           @RequestParam(required = false) String recentDays,
                           @RequestParam(required = false) String minSpanDays) {
        OpsAuth.require(request);
        SurveyEligibility.Audience a = survey.audience(
                param("minDays", minDays), param("minConversions", minConversions),
                param("recentDays", recentDays), param("minSpanDays", minSpanDays));
        return new Preview(a.eligible(), a.visitors(), new Excluded(a.answered(), a.dev()),
                a.ledgerOk() ? "ok" : "unreadable", now());
    }

    @PutMapping
    public View put(HttpServletRequest request, @RequestBody JsonNode body) {
        OpsAuth.require(request);
        String by = OpsAuth.user(request);
        SurveySettings.Values next = SurveySettings.parse(body);
        if (!body.hasNonNull("version") || !body.get("version").isString())
            throw new SurveySettings.Invalid("version 없음");
        try {
            return view(settings.save(next, body.get("version").asString(), by));
        } catch (IOException e) {
            log.error("설문 설정을 저장하지 못했다", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "저장하지 못했습니다");
        }
    }

    /** 400/409의 본문은 {"error": 사유}로 고정한다. 사유에 칸 이름이 든다. */
    @ExceptionHandler(SurveySettings.Invalid.class)
    public ResponseEntity<Map<String, String>> invalid(SurveySettings.Invalid e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(SurveySettings.VersionConflict.class)
    public ResponseEntity<Map<String, String>> conflict(SurveySettings.VersionConflict e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
    }

    private View view(SurveySettings.Snapshot s) {
        SurveySettings.Values v = s.values();
        SurveyEligibility.Audience a = survey.audience(v.minDays(), v.minConversions(), v.recentDays(), v.minSpanDays());
        return new View(v, s.source(), s.problem(), s.version(), gifticons.stock(),
                new AudienceView(a.eligible(), a.visitors(), a.ledgerOk() ? "ok" : "unreadable"));
    }

    private static int param(String name, String raw) {
        if (raw == null || raw.isBlank()) throw new SurveySettings.Invalid(name + " 없음");
        try {
            return SurveySettings.checkRange(name, Integer.parseInt(raw.trim()));
        } catch (NumberFormatException e) {
            throw new SurveySettings.Invalid(name + " 정수 아님: " + raw);
        }
    }

    private static String now() {
        return OffsetDateTime.now(ZoneId.of("Asia/Seoul")).withNano(0).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
}
