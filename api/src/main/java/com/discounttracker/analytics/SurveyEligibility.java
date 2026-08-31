package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Stream;

/**
 * 한 브라우저가 설문 대상인지 원장에서 직접 센다.
 *
 * <p>프론트가 판정하지 않는 이유는 리워드다. 접속일수와 전환수는
 * {@code localStorage}에도 있지만 사용자가 고칠 수 있고, 그 값이 기프티콘을
 * 내주는 조건이면 누구나 받아간다. 원장은 서버에 있으니 서버가 센다.
 *
 * <p>매번 파일 전체를 훑는다. 설문 제출은 하루 몇 건이라 부담이 없고
 * (2026-08-29 기준 38,791줄, 1초 미만), 색인을 두면 원장과 어긋날 자리가
 * 하나 더 생긴다.
 */
@Component
public class SurveyEligibility {

    private static final Logger log = LoggerFactory.getLogger(SurveyEligibility.class);

    /** 스펙이 정한 전환. 앱으로 실제로 보낸 것만 센다. */
    private static final Set<String> CONVERSIONS = Set.of("offer_link_click", "banner_click");

    public static final int MIN_DAYS = 7;
    public static final int MIN_CONVERSIONS = 5;

    private final EventLog eventLog;
    private final ObjectMapper mapper = new ObjectMapper();

    public SurveyEligibility(EventLog eventLog) {
        this.eventLog = eventLog;
    }

    /**
     * @param days        서로 다른 접속 날짜 수(Asia/Seoul 기준 ts 앞 10글자)
     * @param conversions offer_link_click + banner_click 건수
     * @param answered    이미 설문에 답했나 — 1인 1회를 여기서 가른다
     */
    public record Counts(int days, int conversions, boolean answered) {
    }

    public static boolean qualifies(Counts c) {
        return c.days() >= MIN_DAYS && c.conversions() >= MIN_CONVERSIONS && !c.answered();
    }

    public Counts count(String visitorId) {
        if (visitorId == null || visitorId.isBlank()) return new Counts(0, 0, false);

        Path path = eventLog.path();
        // 새로 띄운 서버에는 원장이 아직 없다. 없으면 "대상 아님"이지 오류가 아니다.
        if (!Files.exists(path)) return new Counts(0, 0, false);

        Set<String> days = new HashSet<>();
        int conversions = 0;
        boolean answered = false;

        try (Stream<String> lines = Files.lines(path, StandardCharsets.UTF_8)) {
            for (String line : (Iterable<String>) lines::iterator) {
                JsonNode node = parse(line);
                if (node == null) continue;
                if (!visitorId.equals(text(node, "visitorId"))) continue;
                // 개발 트래픽과 크롤러는 사람이 아니다. 집계에서 빼는 규칙은
                // experiments.py와 같다.
                if (node.path("dev").asBoolean(false)) continue;
                if (!node.path("bot").isNull() && node.hasNonNull("bot")) continue;

                String event = text(node, "event");
                if ("survey_answer".equals(event)) answered = true;

                String ts = text(node, "ts");
                if (ts != null && ts.length() >= 10) days.add(ts.substring(0, 10));
                if (CONVERSIONS.contains(event)) conversions++;
            }
        } catch (IOException e) {
            // 원장을 못 읽으면 대상이 아니라고 본다. 설문이 안 뜨는 것은
            // 사용자에게 아무 손해가 없지만, 500을 던지면 화면 전체가 흔들린다.
            log.error("원장을 읽지 못해 설문 대상 판정을 건너뛴다: {}", path, e);
            return new Counts(0, 0, false);
        }
        return new Counts(days.size(), conversions, answered);
    }

    private JsonNode parse(String line) {
        if (line == null || line.isBlank()) return null;
        try {
            return mapper.readTree(line);
        } catch (IOException e) {
            // 한 줄이 깨져도 나머지는 멀쩡하다 — JSONL을 쓴 이유가 이것이다.
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }
}
