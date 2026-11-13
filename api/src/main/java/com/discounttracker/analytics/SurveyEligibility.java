package com.discounttracker.analytics;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 한 브라우저가 설문 대상인지 원장에서 직접 센다.
 *
 * <p>프론트가 판정하지 않는 이유는 리워드다. 접속일수와 전환수는
 * {@code localStorage}에도 있지만 사용자가 고칠 수 있고, 그 값이 기프티콘을
 * 내주는 조건이면 누구나 받아간다. 원장은 서버에 있으니 서버가 센다.
 *
 * <p>방문자별 집계를 메모리에 들고, 원장에서 새로 붙은 줄만 읽어 더한다(2026-10-14). 예전엔
 * 판정마다 파일 전체를 훑었는데(08-29 38,791줄, 1초 미만) 웹이 첫 화면마다 판정을 물어서 원장이
 * 34만 줄이 되자 한 번에 1.9초가 걸렸다. 집계는 원장에서만 만든다 - 파일이 짧아지면(갈아끼움)
 * 비우고 처음부터 다시 읽으므로 원장과 따로 놀 자리가 없다.
 */
@Component
public class SurveyEligibility {

    private static final Logger log = LoggerFactory.getLogger(SurveyEligibility.class);

    /** 스펙이 정한 전환. 앱으로 실제로 보낸 것만 센다. */
    private static final Set<String> CONVERSIONS = Set.of("offer_link_click", "banner_click");

    public static final int MIN_DAYS = 7;
    public static final int MIN_CONVERSIONS = 5;

    private final EventLog eventLog;
    private final ObjectMapper mapper = JsonMapper.builderWithJackson2Defaults().build();

    /** 판정은 요청마다 돌아 스냅샷은 이 간격보다 자주 쓰지 않는다. */
    private static final long SAVE_EVERY_NANOS = java.util.concurrent.TimeUnit.MINUTES.toNanos(10);

    private final EventLogSnapshot snapshot;   // null이면 꺼짐(지금까지와 같은 동작)
    private boolean restored;
    private long savedAt = System.nanoTime();
    private long savedOffset = -1;

    public SurveyEligibility(EventLog eventLog) {
        this(eventLog, false);
    }

    @Autowired
    public SurveyEligibility(EventLog eventLog,
                             @Value("${analytics.snapshot.enabled:true}") boolean snapshotEnabled) {
        this.eventLog = eventLog;
        this.snapshot = snapshotEnabled ? new EventLogSnapshot(eventLog.path(), "survey", 1) : null;
    }

    /**
     * @param days        서로 다른 접속 날짜 수(Asia/Seoul 기준 ts 앞 10글자)
     * @param conversions offer_link_click + banner_click 건수
     * @param answered    이미 설문에 답했나 — 1인 1회를 여기서 가른다
     * @param dev         한 번이라도 개발 트래픽(?dev=1)을 보낸 브라우저인가
     */
    public record Counts(int days, int conversions, boolean answered, boolean dev, String firstDay, String lastDay) {
        public Counts(int days, int conversions, boolean answered, boolean dev) {
            this(days, conversions, answered, dev, null, null);
        }
    }

    /** 최근 방문·사용 기간 문턱(2026-11-04). 0이면 끈다. today는 Asia/Seoul 날짜. */
    public static boolean recentAndLong(Counts c, int recentDays, int minSpanDays, java.time.LocalDate today) {
        if (recentDays <= 0 && minSpanDays <= 0) return true;
        if (c.firstDay() == null || c.lastDay() == null) return false;
        java.time.LocalDate first = java.time.LocalDate.parse(c.firstDay());
        java.time.LocalDate last = java.time.LocalDate.parse(c.lastDay());
        if (recentDays > 0 && last.isBefore(today.minusDays(recentDays))) return false;
        return minSpanDays <= 0 || !last.isBefore(first.plusDays(minSpanDays));
    }

    /**
     * 자연 자격. 개발자 기기는 문턱을 넘었어도 대상이 아니다.
     *
     * <p>테스트 우회(SurveyService.testVisitors)는 이 판정을 안 지나므로,
     * ?dev=1을 켠 개발자 기기로도 설문 화면을 끝까지 확인할 수 있다 —
     * 확인은 되게 하고 집계·보상에서만 뺀다.
     */
    public static boolean qualifies(Counts c) {
        return qualifies(c, MIN_DAYS, MIN_CONVERSIONS);
    }

    /** 문턱을 설정에서 받는 판정(2026-11-04: 설문 재개 때 기준을 배포 없이 바꾼다). */
    public static boolean qualifies(Counts c, int minDays, int minConversions) {
        return c.days() >= minDays && c.conversions() >= minConversions
                && !c.answered() && !c.dev();
    }

    private static final Counts NONE = new Counts(0, 0, false, false);

    /** 방문자 하나의 집계. 원장에서 읽은 자리까지의 값이다. */
    private static final class Tally {
        final Set<String> days = new HashSet<>();
        int conversions;
        boolean answered;
        boolean dev;
    }

    private final Map<String, Tally> tallies = new HashMap<>();
    private long offset;

    public synchronized Counts count(String visitorId) {
        if (visitorId == null || visitorId.isBlank()) return NONE;
        try {
            catchUp();
        } catch (IOException e) {
            // 원장을 못 읽으면 대상이 아니라고 본다. 설문이 안 뜨는 것은
            // 사용자에게 아무 손해가 없지만, 500을 던지면 화면 전체가 흔들린다.
            // 반쯤 더한 집계는 버리고 다음 판정에서 처음부터 다시 읽는다.
            log.error("원장을 읽지 못해 설문 대상 판정을 건너뛴다: {}", eventLog.path(), e);
            tallies.clear();
            offset = 0;
            return NONE;
        }
        Tally t = tallies.get(visitorId);
        // 새로 띄운 서버에는 원장이 아직 없다. 없으면 "대상 아님"이지 오류가 아니다.
        if (t == null) return NONE;
        return counts(t);
    }

    private static Counts counts(Tally t) {
        String first = t.days.stream().min(String::compareTo).orElse(null);
        String last = t.days.stream().max(String::compareTo).orElse(null);
        return new Counts(t.days.size(), t.conversions, t.answered, t.dev, first, last);
    }

    /**
     * 대상 수 미리보기(317). eligible과 visitors는 원장을 못 읽었으면 null이다 — 0으로 돌려주면
     * "대상 0명"과 "셀 수 없음"이 같아 보인다.
     *
     * @param answered 문턱은 넘었지만 이미 답한 방문자 수
     * @param dev      문턱은 넘었지만 개발 기기인 방문자 수
     */
    public record Audience(boolean ledgerOk, Integer eligible, Integer visitors, int answered, int dev) {}

    /**
     * 이 문턱이면 지금 몇 명이 대상인가. 실제 판정({@link #qualifies(Counts, int, int)}과
     * {@link #recentAndLong})과 같은 함수로 센다. {@code skip}은 사람이 아닌 테스트 id.
     */
    public synchronized Audience audience(int minDays, int minConversions, int recentDays, int minSpanDays,
                                          java.time.LocalDate today, Set<String> skip) {
        try {
            catchUp();
        } catch (IOException e) {
            log.error("원장을 읽지 못해 설문 대상 수를 세지 못한다: {}", eventLog.path(), e);
            tallies.clear();
            offset = 0;
            return new Audience(false, null, null, 0, 0);
        }
        int eligible = 0, answered = 0, dev = 0;
        for (Map.Entry<String, Tally> e : tallies.entrySet()) {
            if (skip.contains(e.getKey())) continue;
            Counts c = counts(e.getValue());
            // 답했나, 개발 기기인가를 뺀 문턱만 본다. 그래야 제외된 수를 따로 셀 수 있다.
            Counts threshold = new Counts(c.days(), c.conversions(), false, false, c.firstDay(), c.lastDay());
            if (!qualifies(threshold, minDays, minConversions)
                    || !recentAndLong(threshold, recentDays, minSpanDays, today)) continue;
            if (c.dev()) dev++;
            else if (c.answered()) answered++;
            else eligible++;
        }
        return new Audience(true, eligible, tallies.size(), answered, dev);
    }

    /** 서버가 뜨자마자 원장을 한 번 읽어 둔다. 안 하면 첫 판정을 부른 방문자가 그 값을 치른다. */
    @EventListener(ApplicationReadyEvent.class)
    public synchronized void warmUp() {
        long t = System.nanoTime();
        count("-");
        log.info("설문 판정 집계 첫 읽기 {}ms, 방문자 {}명", (System.nanoTime() - t) / 1_000_000, tallies.size());
        saveSnapshot();
    }

    /** 내릴 때 한 번 더 써서 다음 기동이 이어 읽을 줄을 줄인다. */
    @PreDestroy
    public synchronized void saveSnapshot() {
        if (snapshot == null || offset == savedOffset) return;
        snapshot.save(offset, state());
        savedOffset = offset;
        savedAt = System.nanoTime();
    }

    private void catchUp() throws IOException {
        if (!restored) {
            restored = true;
            restore();
        }
        long next = eventLog.readFrom(offset, this::add);
        if (next < 0) {
            tallies.clear();
            next = eventLog.readFrom(0, this::add);
        }
        offset = next;
        if (snapshot != null && System.nanoTime() - savedAt > SAVE_EVERY_NANOS) saveSnapshot();
    }

    private void restore() {
        if (snapshot == null) return;
        JsonNode n = snapshot.load();
        if (n == null) return;
        try {
            Map<String, Tally> loaded = new HashMap<>();
            for (Map.Entry<String, JsonNode> e : n.path("state").path("visitors").properties()) {
                JsonNode v = e.getValue();
                Tally t = new Tally();
                for (JsonNode d : v.get(0)) t.days.add(d.asString());
                t.conversions = v.get(1).asInt();
                t.answered = v.get(2).asBoolean();
                t.dev = v.get(3).asBoolean();
                loaded.put(e.getKey(), t);
            }
            tallies.putAll(loaded);
            offset = n.path("offset").asLong();
            savedOffset = offset;
            savedAt = System.nanoTime();
            log.info("설문 판정 스냅샷에서 이어 읽는다: 자리 {}, 방문자 {}명", offset, loaded.size());
        } catch (RuntimeException e) {
            log.warn("설문 판정 스냅샷 내용이 깨져 처음부터 읽는다: {}", e.toString());
            tallies.clear();
            offset = 0;
        }
    }

    private JsonNode state() {
        tools.jackson.databind.node.ObjectNode st = EventLogSnapshot.MAPPER.createObjectNode();
        tools.jackson.databind.node.ObjectNode vs = st.putObject("visitors");
        tallies.forEach((id, t) -> {
            tools.jackson.databind.node.ArrayNode a = vs.putArray(id);
            tools.jackson.databind.node.ArrayNode days = a.addArray();
            t.days.forEach(days::add);
            a.add(t.conversions).add(t.answered).add(t.dev);
        });
        return st;
    }

    private void add(String line) {
        JsonNode node = parse(line);
        if (node == null) return;
        String visitorId = text(node, "visitorId");
        if (visitorId == null) return;
        // 개발 트래픽과 크롤러는 사람이 아니다. 집계에서 빼는 규칙은
        // experiments.py와 같다.
        //
        // 다만 설문 대상 판정에서는 "이 줄만 빼고 나머지는 센다"로는
        // 모자란다. ?dev=1은 브라우저에 영구 저장돼 그 뒤로 쭉 붙는데,
        // 그 앞에 쌓인 줄에는 표시가 없다 — 개발자 폰이 표시를 켜기
        // 전에 이미 문턱을 넘어 있으면 그대로 대상자로 남는다(실측
        // 2026-09-02: 자격자 47명 중 5명이 개발자 기기였고, 그중
        // 하나가 전환 322회로 1위였다). 한 번이라도 개발 트래픽을
        // 보낸 브라우저는 사람이 아니라고 보고 통째로 뺀다.
        if (node.path("dev").asBoolean(false)) {
            tallies.computeIfAbsent(visitorId, k -> new Tally()).dev = true;
            return;
        }
        if (node.hasNonNull("bot")) return;
        Tally t = tallies.computeIfAbsent(visitorId, k -> new Tally());

        String event = text(node, "event");
        // 보상을 못 받은 응답(rewarded=false)은 답한 것으로 안 친다 —
        // 재고가 없어 코드를 못 준 것뿐이라, 재고가 차면 같은 사람이
        // 다시 시도해 보상을 받을 수 있어야 한다(SurveyService.answer
        // 참고). 이 필드가 아예 없는 옛 줄(재고로 막던 시절에 쌓인
        // 것)은 전부 보상이 있었으니 true로 본다.
        if ("survey_answer".equals(event)
                && !"false".equals(text(node.path("props"), "rewarded"))) {
            t.answered = true;
        }

        String ts = text(node, "ts");
        if (ts != null && ts.length() >= 10) t.days.add(ts.substring(0, 10));
        if (CONVERSIONS.contains(event)) t.conversions++;
    }

    private JsonNode parse(String line) {
        if (line == null || line.isBlank()) return null;
        try {
            return mapper.readTree(line);
        } catch (JacksonException e) {
            // 한 줄이 깨져도 나머지는 멀쩡하다 — JSONL을 쓴 이유가 이것이다.
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asString();
    }
}
