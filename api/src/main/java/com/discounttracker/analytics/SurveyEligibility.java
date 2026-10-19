package com.discounttracker.analytics;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    public SurveyEligibility(EventLog eventLog) {
        this.eventLog = eventLog;
    }

    /**
     * @param days        서로 다른 접속 날짜 수(Asia/Seoul 기준 ts 앞 10글자)
     * @param conversions offer_link_click + banner_click 건수
     * @param answered    이미 설문에 답했나 — 1인 1회를 여기서 가른다
     * @param dev         한 번이라도 개발 트래픽(?dev=1)을 보낸 브라우저인가
     */
    public record Counts(int days, int conversions, boolean answered, boolean dev) {
    }

    /**
     * 자연 자격. 개발자 기기는 문턱을 넘었어도 대상이 아니다.
     *
     * <p>테스트 우회(SurveyService.testVisitors)는 이 판정을 안 지나므로,
     * ?dev=1을 켠 개발자 기기로도 설문 화면을 끝까지 확인할 수 있다 —
     * 확인은 되게 하고 집계·보상에서만 뺀다.
     */
    public static boolean qualifies(Counts c) {
        return c.days() >= MIN_DAYS && c.conversions() >= MIN_CONVERSIONS
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
        return t == null ? NONE : new Counts(t.days.size(), t.conversions, t.answered, t.dev);
    }

    /** 서버가 뜨자마자 원장을 한 번 읽어 둔다. 안 하면 첫 판정을 부른 방문자가 그 값을 치른다. */
    @EventListener(ApplicationReadyEvent.class)
    public synchronized void warmUp() {
        long t = System.nanoTime();
        count("-");
        log.info("설문 판정 집계 첫 읽기 {}ms, 방문자 {}명", (System.nanoTime() - t) / 1_000_000, tallies.size());
    }

    private void catchUp() throws IOException {
        long next = eventLog.readFrom(offset, this::add);
        if (next < 0) {
            tallies.clear();
            next = eventLog.readFrom(0, this::add);
        }
        offset = next;
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
