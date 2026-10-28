package com.discounttracker.analytics;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.IOException;
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
 * <p>표는 10분에 한 번, 그리고 reload 때 다시 센다. 원장은 처음 한 번만 다 읽고 그 뒤로는 새로 붙은 줄만
 * 읽는다(2026-10-14). 다시 셀 때마다 파일 전체(177MB, 34만 줄)를 읽어 10분마다 한 요청이 2초 늦었다.
 * 지난 7일의 누름만 메모리에 둔다(주 800건 남짓). 파일이 없거나 깨지면 빈 표다 — 인기순은 그때 0으로
 * 같은 값이 되어 다음 기준으로 넘어간다.
 */
@Component
public class PopularityIndex {

    private static final Logger log = LoggerFactory.getLogger(PopularityIndex.class);
    static final Duration DAY = Duration.ofHours(24);
    static final Duration WEEK = Duration.ofDays(7);
    private static final Duration REFRESH = Duration.ofMinutes(10);
    private static final Set<String> EVENTS = Set.of("offer_link_click", "banner_click");

    private final EventLog eventLog;
    private final ObjectMapper mapper;
    private final Clock clock;
    private volatile Map<String, Integer> scores = Map.of();     // 이번 주(7일) 사람 수
    private volatile Map<String, Integer> today = Map.of();      // 오늘(24시간) 사람 수
    private volatile Map<String, Integer> yesterday = Map.of();  // 그 전 24시간(24~48시간 전). 옛 웹이 읽는다(2026-10-14), 새 웹은 previous를 쓴다
    private volatile Map<String, Integer> previous = Map.of();   // 직전 갱신 때의 오늘(24시간) 사람 수. 순위 등락용(2026-10-20)
    private volatile Instant computedAt = Instant.EPOCH;

    private final EventLogSnapshot snapshot;   // null이면 꺼짐(지금까지와 같은 동작)
    private boolean restored;

    public PopularityIndex(EventLog eventLog, ObjectMapper mapper, Clock clock) {
        this(eventLog, mapper, clock, false);
    }

    @Autowired
    public PopularityIndex(EventLog eventLog, ObjectMapper mapper, Clock clock,
                           @Value("${analytics.snapshot.enabled:true}") boolean snapshotEnabled) {
        this.eventLog = eventLog;
        this.mapper = mapper;
        this.clock = clock;
        this.snapshot = snapshotEnabled ? new EventLogSnapshot(eventLog.path(), "popularity", 1) : null;
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

    /** 브랜드 대표명 → 그 전 24시간(24~48시간 전) 누른 사람 수. 없으면 0. */
    public int yesterdayOf(String brand) {
        refreshIfStale();
        return yesterday.getOrDefault(brand, 0);
    }

    /**
     * 직전 갱신(REFRESH 주기) 때의 오늘(24시간) 사람 수. 순위 변동은 이것과 지금 순위의 차이로 센다 — 집계는 24시간,
     * 등락은 갱신 주기다(2026-10-20 사용자). 첫 계산(서버를 막 띄움)에는 직전이 없어 지금 값과 같다.
     */
    public int previousOf(String brand) {
        refreshIfStale();
        return previous.getOrDefault(brand, 0);
    }

    public Map<String, Integer> scores() {
        refreshIfStale();
        return scores;
    }

    /** 누름 한 건. 7일이 지나면 버린다. */
    private record Click(Instant at, String brand, String visitor) {
    }

    private final java.util.ArrayDeque<Click> clicks = new java.util.ArrayDeque<>();
    private long offset;

    public synchronized void reload() {
        Instant now = clock.instant();
        Instant weekSince = now.minus(WEEK);
        Instant daySince = now.minus(DAY);
        Instant prevSince = now.minus(DAY.multipliedBy(2));
        if (!restored) {
            restored = true;
            restore();
        }
        try {
            long next = eventLog.readFrom(offset, this::add);
            if (next < 0) {                                         // 원장을 갈아끼웠다
                clicks.clear();
                next = eventLog.readFrom(0, this::add);
            }
            offset = next;
        } catch (IOException e) {
            log.warn("events.jsonl을 읽지 못해 인기 점수를 비운다: {}", e.toString());
            clicks.clear();
            offset = 0;
        }
        // 원장은 대개 시간순이지만 늦게 온 배치가 섞일 수 있어 앞에서 끊지 않고 전부 본다(800건 남짓).
        clicks.removeIf(c -> c.at().isBefore(weekSince));
        // 10분에 한 번 도는 reload마다 쓴다. 7일 안 누름만이라 작다(주 800건 남짓).
        if (snapshot != null) snapshot.save(offset, state());
        Map<String, Set<String>> week = new HashMap<>();
        Map<String, Set<String>> day = new HashMap<>();
        Map<String, Set<String>> prev = new HashMap<>();
        for (Click c : clicks) {
            week.computeIfAbsent(c.brand(), k -> new HashSet<>()).add(c.visitor());
            if (!c.at().isBefore(daySince)) day.computeIfAbsent(c.brand(), k -> new HashSet<>()).add(c.visitor());
            else if (!c.at().isBefore(prevSince)) prev.computeIfAbsent(c.brand(), k -> new HashSet<>()).add(c.visitor());
        }
        Map<String, Integer> before = today;
        boolean first = computedAt.equals(Instant.EPOCH);
        scores = counts(week);
        today = counts(day);
        yesterday = counts(prev);
        previous = first ? today : before;
        computedAt = clock.instant();
    }

    /** 서버가 뜨자마자 한 번 센다. 안 하면 첫 화면을 연 방문자가 원장 전체 읽기를 치른다. */
    @EventListener(ApplicationReadyEvent.class)
    public synchronized void warmUp() {
        long t = System.nanoTime();
        reload();
        log.info("인기 표 첫 계산 {}ms, 지난 7일 누름 {}건", (System.nanoTime() - t) / 1_000_000, clicks.size());
    }

    private void restore() {
        if (snapshot == null) return;
        JsonNode n = snapshot.load();
        if (n == null) return;
        try {
            java.util.List<Click> loaded = new java.util.ArrayList<>();
            for (JsonNode c : n.path("state").path("clicks")) {
                loaded.add(new Click(Instant.parse(c.get(0).asString()), c.get(1).asString(), c.get(2).asString()));
            }
            clicks.addAll(loaded);
            offset = n.path("offset").asLong();
            log.info("인기 스냅샷에서 이어 읽는다: 자리 {}, 누름 {}건", offset, loaded.size());
        } catch (RuntimeException e) {
            log.warn("인기 스냅샷 내용이 깨져 처음부터 읽는다: {}", e.toString());
            clicks.clear();
            offset = 0;
        }
    }

    private JsonNode state() {
        tools.jackson.databind.node.ObjectNode st = EventLogSnapshot.MAPPER.createObjectNode();
        tools.jackson.databind.node.ArrayNode arr = st.putArray("clicks");
        for (Click c : clicks) arr.addArray().add(c.at().toString()).add(c.brand()).add(c.visitor());
        return st;
    }

    private void add(String line) {
        // 원장 대부분은 누름이 아니다(34만 줄 중 주 800건). JSON을 풀기 전에 글자로 먼저 거른다.
        if (!line.contains("_click\"")) return;
        JsonNode n;
        try {
            n = mapper.readTree(line);
        } catch (JacksonException e) {
            return;                                                 // 깨진 줄 하나가 표 전체를 막지 않는다
        }
        String event = n.path("event").asString(null);
        if (event == null || !EVENTS.contains(event)) return;
        // 개발 접속과 크롤러는 다른 집계처럼 뺀다(SurveyEligibility와 같은 판정, 2026-10-14).
        if (n.path("dev").asBoolean(false) || n.hasNonNull("bot")) return;
        String brand = n.path("props").path("brand").asString(null);
        if (brand == null || brand.isBlank() || "none".equals(brand)) return;
        String visitor = n.path("visitorId").asString(null);
        if (visitor == null || visitor.isBlank()) return;
        Instant at = parse(n.path("ts").asString(null));
        if (at == null || at.isBefore(clock.instant().minus(WEEK))) return;
        clicks.add(new Click(at, brand, visitor));
    }

    private boolean stale() {
        return Duration.between(computedAt, clock.instant()).compareTo(REFRESH) > 0;
    }

    private void refreshIfStale() {
        if (stale()) {
            // 읽기 둘이 동시에 낡음을 보고 연달아 다시 세면 직전 값이 방금 센 값으로 덮여 등락이 사라진다(CodeRabbit).
            // 잠근 안에서 한 번 더 본다.
            synchronized (this) {
                if (stale()) reload();
            }
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
