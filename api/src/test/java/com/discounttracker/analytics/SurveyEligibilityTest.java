package com.discounttracker.analytics;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SurveyEligibilityTest {

    @TempDir Path tmp;

    /** 원장 한 줄. 이 테스트가 쓰는 필드만 채운다. */
    private String line(String ts, String event, String visitorId) {
        return "{\"ts\":\"" + ts + "\",\"event\":\"" + event
                + "\",\"visitorId\":\"" + visitorId + "\"}";
    }

    private SurveyEligibility on(List<String> lines) throws IOException {
        Path log = tmp.resolve("events.jsonl");
        Files.write(log, lines, StandardCharsets.UTF_8);
        return new SurveyEligibility(new EventLog(log.toString(), new ObjectMapper()));
    }

    @Test
    void countsDistinctDaysAndConversions() throws Exception {
        SurveyEligibility e = on(List.of(
                line("2026-08-01T10:00:00+09:00", "page_view", "v_1"),
                line("2026-08-01T10:01:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-01T10:02:00+09:00", "banner_click", "v_1"),
                line("2026-08-02T10:00:00+09:00", "offer_link_click", "v_1")));

        SurveyEligibility.Counts c = e.count("v_1");
        assertEquals(2, c.days(), "8/1과 8/2 이틀");
        assertEquals(3, c.conversions(), "offer_link_click 2 + banner_click 1");
        assertFalse(c.answered());
    }

    @Test
    void ignoresOtherVisitors() throws Exception {
        SurveyEligibility e = on(List.of(
                line("2026-08-01T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-02T10:00:00+09:00", "offer_link_click", "v_2")));

        assertEquals(1, e.count("v_1").conversions());
    }

    /** 개발 트래픽과 크롤러는 대상 집계에서 뺀다. */
    @Test
    void ignoresDevAndBotLines() throws Exception {
        Path log = tmp.resolve("events.jsonl");
        Files.write(log, List.of(
                "{\"ts\":\"2026-08-01T10:00:00+09:00\",\"event\":\"offer_link_click\","
                        + "\"visitorId\":\"v_1\",\"dev\":true}",
                "{\"ts\":\"2026-08-02T10:00:00+09:00\",\"event\":\"offer_link_click\","
                        + "\"visitorId\":\"v_1\",\"bot\":\"googlebot\"}"), StandardCharsets.UTF_8);
        SurveyEligibility e = new SurveyEligibility(
                new EventLog(log.toString(), new ObjectMapper()));

        assertEquals(0, e.count("v_1").days());
        assertEquals(0, e.count("v_1").conversions());
    }

    @Test
    void marksAlreadyAnswered() throws Exception {
        SurveyEligibility e = on(List.of(
                line("2026-08-01T10:00:00+09:00", "survey_answer", "v_1")));

        assertTrue(e.count("v_1").answered());
    }

    /** 원장이 아직 없을 수도 있다 — 새 서버에서 첫 요청이 500이면 안 된다. */
    @Test
    void missingLogCountsAsZero() {
        SurveyEligibility e = new SurveyEligibility(
                new EventLog(tmp.resolve("없는파일.jsonl").toString(), new ObjectMapper()));

        assertEquals(0, e.count("v_1").days());
    }

    @Test
    void qualifiesNeedsBothThresholds() {
        assertTrue(SurveyEligibility.qualifies(new SurveyEligibility.Counts(7, 5, false, false)));
        // 최근 방문·사용 기간 문턱(2026-11-04)
        java.time.LocalDate today = java.time.LocalDate.of(2026, 11, 4);
        var longRecent = new SurveyEligibility.Counts(12, 5, false, false, "2026-09-20", "2026-10-25");
        assertTrue(SurveyEligibility.recentAndLong(longRecent, 14, 30, today));
        assertFalse(SurveyEligibility.recentAndLong(longRecent, 7, 30, today));   // 최근 7일엔 안 옴
        assertFalse(SurveyEligibility.recentAndLong(new SurveyEligibility.Counts(12, 5, false, false, "2026-10-10", "2026-11-03"), 14, 30, today)); // 25일 사용
        assertTrue(SurveyEligibility.recentAndLong(new SurveyEligibility.Counts(1, 0, false, false), 0, 0, today)); // 끄면 통과
        // 설정 문턱(2026-11-04): 낮춘 문턱으로도 같은 규칙(1인 1회, 개발 기기 제외)
        assertTrue(SurveyEligibility.qualifies(new SurveyEligibility.Counts(3, 2, false, false), 3, 2));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(3, 2, true, false), 3, 2));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(2, 2, false, false), 3, 2));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(6, 5, false, false)));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(7, 4, false, false)));
        assertFalse(SurveyEligibility.qualifies(new SurveyEligibility.Counts(7, 5, true, false)));
    }

    /**
     * 개발자 기기는 문턱을 넘었어도 대상이 아니다.
     *
     * <p>?dev=1은 브라우저에 영구 저장되므로 그것을 켜기 전에 쌓인 줄에는
     * 표시가 없다 — 그 앞줄만으로 문턱을 넘어 있으면 표시를 켜도 대상자로
     * 남는다. 그래서 "이 줄만 빼기"가 아니라 "이 브라우저를 통째로 빼기"다
     * (실측 2026-09-02: 자격자 47명 중 5명이 개발자 기기였다).
     */
    @Test
    void oneDevLineDisqualifiesTheWholeVisitor() throws Exception {
        SurveyEligibility e = on(List.of(
                line("2026-08-01T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-02T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-03T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-04T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-05T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-06T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-07T10:00:00+09:00", "offer_link_click", "v_1"),
                // 마지막 딱 한 줄만 개발 트래픽이다.
                "{\"ts\":\"2026-08-08T10:00:00+09:00\",\"event\":\"page_view\","
                        + "\"visitorId\":\"v_1\",\"dev\":true}"));

        SurveyEligibility.Counts c = e.count("v_1");
        assertTrue(c.dev(), "개발 트래픽 흔적이 잡혀야 한다");
        assertTrue(c.days() >= MIN_DAYS_FOR_TEST, "문턱 자체는 넘었는데도");
        assertFalse(SurveyEligibility.qualifies(c), "대상에서 빠진다");
    }

    private static final int MIN_DAYS_FOR_TEST = 7;

    /** 판정 사이에 붙은 줄도 센다. 집계를 메모리에 들게 된 뒤(2026-10-14) 새 줄을 놓치면 문턱을 영영 못 넘는다. */
    @Test
    void countsLinesAppendedAfterFirstCount() throws Exception {
        Path log = tmp.resolve("events.jsonl");
        Files.write(log, List.of(line("2026-08-01T10:00:00+09:00", "offer_link_click", "v_1")), StandardCharsets.UTF_8);
        SurveyEligibility e = new SurveyEligibility(new EventLog(log.toString(), new ObjectMapper()));
        assertEquals(1, e.count("v_1").conversions());

        Files.write(log, List.of(line("2026-08-02T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-02T10:01:00+09:00", "survey_answer", "v_1")),
                StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
        SurveyEligibility.Counts c = e.count("v_1");
        assertEquals(2, c.conversions());
        assertEquals(2, c.days());
        assertTrue(c.answered());
    }

    /** 원장을 갈아끼우면(더 짧은 파일) 옛 집계를 버리고 새 파일로 다시 센다. */
    @Test
    void recountsWhenLogIsReplaced() throws Exception {
        Path log = tmp.resolve("events.jsonl");
        Files.write(log, List.of(
                line("2026-08-01T10:00:00+09:00", "offer_link_click", "v_1"),
                line("2026-08-02T10:00:00+09:00", "offer_link_click", "v_1")), StandardCharsets.UTF_8);
        SurveyEligibility e = new SurveyEligibility(new EventLog(log.toString(), new ObjectMapper()));
        assertEquals(2, e.count("v_1").conversions());

        Files.write(log, List.of(line("2026-08-03T10:00:00+09:00", "page_view", "v_1")), StandardCharsets.UTF_8);
        assertEquals(0, e.count("v_1").conversions());
        assertEquals(1, e.count("v_1").days());
    }

    private static final java.time.LocalDate TODAY = java.time.LocalDate.parse("2026-11-04");

    /** 일수만큼 날마다 전환 한 번. */
    private void visitor(List<String> out, String id, String from, int days) {
        java.time.LocalDate d = java.time.LocalDate.parse(from);
        for (int i = 0; i < days; i++) out.add(line(d.plusDays(i) + "T10:00:00+09:00", "offer_link_click", id));
    }

    /** 미리보기(317): 응답자, 개발 기기, 문턱 미달, 테스트 id를 뺀다. 제외 수는 따로 센다. */
    @Test
    void audienceCountsOnlyThoseWhoWouldBeAskedAndSeparatesExclusions() throws Exception {
        List<String> lines = new java.util.ArrayList<>();
        visitor(lines, "v_ok", "2026-10-20", 8);            // 8일, 전환 8
        visitor(lines, "v_short", "2026-10-30", 3);         // 접속일 미달
        visitor(lines, "v_old", "2026-08-01", 8);           // 최근 14일 밖
        visitor(lines, "v_answered", "2026-10-20", 8);
        lines.add(line("2026-10-28T10:00:00+09:00", "survey_answer", "v_answered"));
        visitor(lines, "v_test", "2026-10-20", 8);
        visitor(lines, "v_dev", "2026-10-20", 8);
        lines.add("{\"ts\":\"2026-10-29T10:00:00+09:00\",\"event\":\"page_view\",\"visitorId\":\"v_dev\",\"dev\":true}");
        SurveyEligibility e = on(lines);

        var a = e.audience(7, 5, 14, 0, TODAY, java.util.Set.of("v_test"));
        assertTrue(a.ledgerOk());
        assertEquals(1, a.eligible(), "v_ok 하나");
        assertEquals(1, a.answered());
        assertEquals(1, a.dev());
        assertEquals(6, a.visitors(), "테스트 id도 원장에는 있으니 방문자 수에는 든다");

        // 같은 문턱의 실제 판정과 같은 답이어야 한다.
        assertTrue(SurveyEligibility.qualifies(e.count("v_ok"), 7, 5)
                && SurveyEligibility.recentAndLong(e.count("v_ok"), 14, 0, TODAY));
        assertEquals(2, e.audience(7, 5, 0, 0, TODAY, java.util.Set.of("v_test")).eligible(),
                "최근 문턱을 끄면 v_old도 든다");
    }

    /** 원장을 못 읽으면 0이 아니라 null이다(셀 수 없음). */
    @Test
    void audienceIsNullNotZeroWhenLedgerUnreadable() throws Exception {
        Path dir = tmp.resolve("디렉터리");
        Files.createDirectories(dir);   // 파일 자리에 디렉터리가 있어 읽기가 IOException
        SurveyEligibility e = new SurveyEligibility(new EventLog(dir.toString(), new ObjectMapper()));

        var a = e.audience(7, 5, 0, 0, TODAY, java.util.Set.of());
        assertFalse(a.ledgerOk());
        assertNull(a.eligible());
        assertNull(a.visitors());
    }
}
