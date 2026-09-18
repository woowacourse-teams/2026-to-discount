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
import java.util.Map;
import java.util.Set;

/**
 * 브랜드별 인기 점수(2026-09-19, 정렬 "인기순"). 원장 이벤트(events.jsonl)에서 최근 14일의
 * 사용자 행동을 브랜드별로 센다. PostHog와 같은 이벤트가 이 파일에도 남으므로 같은 기준이다.
 *
 * <p>세는 이벤트와 무게: 할인 칩 클릭(offer_link_click) 3, 배너 클릭(banner_click) 2,
 * 카드 펼침(brand_expand) 1. 노출(impression)은 화면 위치가 정하므로 안 센다.
 *
 * <p>파일이 크므로(15만 줄) 요청마다 읽지 않는다. 10분에 한 번, 그리고 reload 때 다시 센다.
 * 파일이 없거나 깨지면 빈 표다 — 인기순은 그때 0으로 같은 값이 되어 다음 기준으로 넘어간다.
 */
@Component
public class PopularityIndex {

    private static final Logger log = LoggerFactory.getLogger(PopularityIndex.class);
    private static final Duration WINDOW = Duration.ofDays(14);
    private static final Duration REFRESH = Duration.ofMinutes(10);
    private static final Map<String, Integer> WEIGHTS = Map.of(
            "offer_link_click", 3, "banner_click", 2, "brand_expand", 1);
    private static final Set<String> EVENTS = WEIGHTS.keySet();

    private final Path path;
    private final ObjectMapper mapper;
    private final Clock clock;
    private volatile Map<String, Integer> scores = Map.of();
    private volatile Instant computedAt = Instant.EPOCH;

    public PopularityIndex(EventLog eventLog, ObjectMapper mapper, Clock clock) {
        this.path = eventLog.path();
        this.mapper = mapper;
        this.clock = clock;
    }

    /** 브랜드 대표명 → 점수. 없으면 0. */
    public int scoreOf(String brand) {
        refreshIfStale();
        return scores.getOrDefault(brand, 0);
    }

    public Map<String, Integer> scores() {
        refreshIfStale();
        return scores;
    }

    public synchronized void reload() {
        Map<String, Integer> next = new HashMap<>();
        Instant since = clock.instant().minus(WINDOW);
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
                    String brand = n.path("props").path("brand").asText(null);
                    if (brand == null || brand.isBlank() || "none".equals(brand)) continue;
                    if (!within(n.path("ts").asText(null), since)) continue;
                    next.merge(brand, WEIGHTS.get(event), Integer::sum);
                }
            } catch (IOException e) {
                log.warn("events.jsonl을 읽지 못해 인기 점수를 비운다: {}", e.toString());
            }
        }
        scores = Map.copyOf(next);
        computedAt = clock.instant();
    }

    private void refreshIfStale() {
        if (Duration.between(computedAt, clock.instant()).compareTo(REFRESH) > 0) {
            reload();
        }
    }

    private static boolean within(String ts, Instant since) {
        if (ts == null) return false;
        try {
            return !OffsetDateTime.parse(ts).toInstant().isBefore(since);
        } catch (DateTimeParseException e) {
            return false;
        }
    }
}
