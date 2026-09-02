package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
}
