package com.discounttracker.analytics;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 요약 스냅샷(2026-10-16): 스냅샷에서 이어 읽은 결과가 원장 전체를 읽은 결과와 같아야 하고, 안 맞으면 전체로 떨어진다. */
class EventLogSnapshotTest {

    @TempDir Path dir;
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-14T06:00:00Z"), ZoneId.of("Asia/Seoul"));
    private static final String[] EVENTS = {"page_view", "offer_link_click", "banner_click", "brand_expand", "survey_answer"};
    private static final String[] BRANDS = {"bhc", "BBQ", "교촌", "none"};

    /** 열흘에 걸친 임의의 줄. 개발 접속, 크롤러, 깨진 줄, 보상 없는 응답이 섞인다. */
    private static List<String> lines(int n, long seed) {
        Random r = new Random(seed);
        List<String> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            if (r.nextInt(50) == 0) { out.add("not json"); continue; }
            String ts = Instant.parse("2026-10-04T06:00:00Z").plusSeconds(r.nextInt(10 * 86400))
                    .atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime().toString();
            String extra = r.nextInt(30) == 0 ? ",\"dev\":true" : r.nextInt(30) == 0 ? ",\"bot\":\"x\"" : "";
            String rewarded = r.nextBoolean() ? "true" : "false";
            out.add("{\"ts\":\"" + ts + "\",\"event\":\"" + EVENTS[r.nextInt(EVENTS.length)] + "\",\"visitorId\":\"v" + r.nextInt(40)
                    + "\"" + extra + ",\"props\":{\"brand\":\"" + BRANDS[r.nextInt(BRANDS.length)] + "\",\"rewarded\":\"" + rewarded + "\"}}");
        }
        return out;
    }

    private Path log(List<String> lines) throws Exception {
        Path log = dir.resolve("events.jsonl");
        Files.write(log, lines, StandardCharsets.UTF_8);
        return log;
    }

    private static void append(Path log, List<String> lines) throws Exception {
        Files.write(log, lines, StandardCharsets.UTF_8, StandardOpenOption.APPEND);
    }

    private Map<String, Object> survey(Path log, boolean snap) {
        SurveyEligibility e = new SurveyEligibility(new EventLog(log.toString(), new ObjectMapper()), snap);
        e.warmUp();
        Map<String, Object> out = new HashMap<>();
        for (int i = 0; i < 40; i++) out.put("v" + i, e.count("v" + i));
        return out;
    }

    private List<Object> popularity(Path log, boolean snap) {
        PopularityIndex p = new PopularityIndex(new EventLog(log.toString(), new ObjectMapper()), new ObjectMapper(), clock, snap);
        p.warmUp();
        List<Object> out = new ArrayList<>();
        out.add(p.scores());
        for (String b : BRANDS) out.add(List.of(p.todayOf(b), p.yesterdayOf(b)));
        return out;
    }

    @Test
    void snapshotPathMatchesFullRead() throws Exception {
        Path log = log(lines(3000, 1));
        survey(log, true);                                  // 스냅샷을 남긴다
        popularity(log, true);
        assertTrue(Files.exists(dir.resolve("events.jsonl.survey.snapshot.json")));
        assertTrue(Files.exists(dir.resolve("events.jsonl.popularity.snapshot.json")));
        append(log, lines(2000, 2));                        // 그 뒤로 붙은 줄

        assertEquals(survey(log, false), survey(log, true));
        assertEquals(popularity(log, false), popularity(log, true));
    }

    @Test
    void brokenOrMismatchedSnapshotFallsBackToFullRead() throws Exception {
        Path log = log(lines(3000, 3));
        Map<String, Object> full = survey(log, false);
        List<Object> fullPop = popularity(log, false);
        Path s = dir.resolve("events.jsonl.survey.snapshot.json");
        Path p = dir.resolve("events.jsonl.popularity.snapshot.json");

        for (String bad : List.of("{깨짐", "{\"version\":99,\"offset\":0,\"head\":\"\",\"state\":{}}", "")) {
            Files.writeString(s, bad);
            Files.writeString(p, bad);
            assertEquals(full, survey(log, true), bad);
            assertEquals(fullPop, popularity(log, true), bad);
        }
    }

    @Test
    void replacedOrTruncatedLogFallsBackToFullRead() throws Exception {
        Path log = log(lines(3000, 4));
        survey(log, true);
        popularity(log, true);

        // 잘린(더 짧은) 원장: 자리가 크기를 넘는다
        log(lines(500, 5));
        assertEquals(survey(log, false), survey(log, true));
        assertEquals(popularity(log, false), popularity(log, true));

        // 같은 크기 이상으로 갈아끼운 원장: 자리는 맞지만 앞부분 해시가 다르다
        survey(log, true);
        popularity(log, true);
        log(lines(4000, 6));
        assertEquals(survey(log, false), survey(log, true));
        assertEquals(popularity(log, false), popularity(log, true));
    }

    @Test
    void failedWriteKeepsPreviousSnapshot() throws Exception {
        Path log = log(lines(1000, 7));
        survey(log, true);
        Path s = dir.resolve("events.jsonl.survey.snapshot.json");
        byte[] before = Files.readAllBytes(s);

        append(log, lines(1000, 8));
        Files.createDirectory(dir.resolve("events.jsonl.survey.snapshot.json.tmp")); // tmp 자리를 막아 쓰기를 실패시킨다
        Files.writeString(dir.resolve("events.jsonl.survey.snapshot.json.tmp").resolve("x"), "x");
        survey(log, true);

        assertArrayEquals(before, Files.readAllBytes(s));
        assertEquals(survey(log, false), survey(log, true)); // 옛 스냅샷 + 이어 읽기도 여전히 맞다
    }

    @Test
    void switchOffWritesNothing() throws Exception {
        Path log = log(lines(500, 9));
        survey(log, false);
        popularity(log, false);
        try (var files = Files.list(dir)) {
            assertEquals(1, files.count());
        }
        assertNotEquals(0, Files.size(log));
    }
}
