package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 브랜드별 인기(2026-09-19, 정렬 "인기순"). 원장 이벤트(events.jsonl)에서 할인 링크나 배너를 누른
 * **서로 다른 방문자 수**를 브랜드별로 센다. 한 사람이 여러 번 눌러도 1이다(docs/ANALYTICS.md "사람 수로 세라").
 *
 * <p>2026-10-14: 클릭·펼침 가중합(14일)에서 사람 수로 바꿨다. 가중합은 24시간 상위 5곳 중 둘이 사실상 한 사람의
 * 클릭이었다(피자헛 84%, 가마치통닭 80%). 기간은 둘이다 — 오늘(24시간)과 이번 주(7일). 하루 전 같은 기간과 상위 10곳이
 * 겹치는 비율이 24시간 41%, 7일 75%였다(6시간 이하는 23% 이하라 순위가 매번 뒤집힌다). 펼침은 사람이 고른 신호가
 * 약해 뺐다. 개발 접속(dev)과 크롤러(bot)는 뺀다.
 *
 * <p>파일이 크므로(15만 줄) 요청마다 읽지 않는다. 10분에 한 번, 그리고 reload 때 다시 센다.
 * 파일이 없거나 깨지면 빈 표다 — 인기순은 그때 0으로 같은 값이 되어 다음 기준으로 넘어간다.
 */
@Component
public class PopularityIndex {

    private static final Logger log = LoggerFactory.getLogger(PopularityIndex.class);
    static final Duration DAY = Duration.ofHours(24);
    static final Duration WEEK = Duration.ofDays(7);
    private static final Duration REFRESH = Duration.ofMinutes(10);
    private static final Set<String> EVENTS = Set.of("offer_link_click", "banner_click");

    private final Path path;
    private final ObjectMapper mapper;
    private final Clock clock;
    private volatile Map<String, Integer> scores = Map.of();     // 이번 주(7일) 사람 수
    private volatile Map<String, Integer> today = Map.of();      // 오늘(24시간) 사람 수
    private volatile Instant computedAt = Instant.EPOCH;

    public PopularityIndex(EventLog eventLog, ObjectMapper mapper, Clock clock) {
        this.path = eventLog.path();
        this.mapper = mapper;
        this.clock = clock;
    }

    /** 브랜드 대표명 → 이번 주(7일) 누른 사람 수. 없으면 0. */
    public int scoreOf(String brand) {
        refreshIfStale();
        return scores.getOrDefault(brand, 0);
    }

    /** 브랜드 대표명 → 오늘(24시간) 누른 사람 수. 없으면 0. */
    public int todayOf(String brand) {
        refreshIfStale();
        return today.getOrDefault(brand, 0);
    }

    public Map<String, Integer> scores() {
        refreshIfStale();
        return scores;
    }

    public synchronized void reload() {
        Map<String, Set<String>> week = new HashMap<>();
        Map<String, Set<String>> day = new HashMap<>();
        Instant now = clock.instant();
        Instant weekSince = now.minus(WEEK);
        Instant daySince = now.minus(DAY);
        if (Files.exists(path)) {
            try (BufferedReader r = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (line.isBlank()) continue;
                    JsonNode n;
                    try {
                        n = mapper.readTree(line);
                    } catch (IOException e) {
                        continue;                                   // 깨진 줄 하나가 표 전체를 막지 않는다
                    }
                    String event = n.path("event").asText(null);
                    if (event == null || !EVENTS.contains(event)) continue;
                    // 개발 접속과 크롤러는 다른 집계처럼 뺀다(SurveyEligibility와 같은 판정, 2026-10-14).
                    if (n.path("dev").asBoolean(false) || n.hasNonNull("bot")) continue;
                    String brand = n.path("props").path("brand").asText(null);
                    if (brand == null || brand.isBlank() || "none".equals(brand)) continue;
                    String visitor = n.path("visitorId").asText(null);
                    if (visitor == null || visitor.isBlank()) continue;
                    Instant at = parse(n.path("ts").asText(null));
                    if (at == null || at.isBefore(weekSince)) continue;
                    week.computeIfAbsent(brand, k -> new HashSet<>()).add(visitor);
                    if (!at.isBefore(daySince)) day.computeIfAbsent(brand, k -> new HashSet<>()).add(visitor);
                }
            } catch (IOException e) {
                log.warn("events.jsonl을 읽지 못해 인기 점수를 비운다: {}", e.toString());
            }
        }
        scores = counts(week);
        today = counts(day);
        computedAt = clock.instant();
    }

    private void refreshIfStale() {
        if (Duration.between(computedAt, clock.instant()).compareTo(REFRESH) > 0) {
            reload();
        }
    }

    private static Map<String, Integer> counts(Map<String, Set<String>> people) {
        Map<String, Integer> out = new HashMap<>();
        people.forEach((brand, who) -> out.put(brand, who.size()));
        return Map.copyOf(out);
    }

    private static Instant parse(String ts) {
        if (ts == null) return null;
        try {
            return OffsetDateTime.parse(ts).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
