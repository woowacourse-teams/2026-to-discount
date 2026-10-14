package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class EventLogTest {

    private VisitEvent event(String name) {
        return new VisitEvent("2026-07-29T14:00:00+09:00", name, "v_1", "s_1", 2,
                "/", "direct", "mobile", "430x932", 1200L,
                Map.of("brand", "BBQ"), "2026-07-29T05:00:00Z", "abcd1234", null,
                "a", "event-id", null);
    }

    @Test
    void appendsOneLinePerEvent(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("events.jsonl");
        EventLog log = new EventLog(file.toString(), new ObjectMapper());

        log.append(List.of(event("page_view"), event("brand_expand")));
        log.append(List.of(event("page_exit")));

        List<String> lines = Files.readAllLines(file);
        assertEquals(3, lines.size());
        assertTrue(lines.get(0).contains("\"event\":\"page_view\""));
        assertTrue(lines.get(2).contains("\"event\":\"page_exit\""));
    }

    @Test
    void createsParentDirectory(@TempDir Path dir) {
        Path file = dir.resolve("nested/deeper/events.jsonl");
        new EventLog(file.toString(), new ObjectMapper()).append(List.of(event("page_view")));
        assertTrue(Files.exists(file));
    }

    @Test
    void emptyBatchWritesNothing(@TempDir Path dir) {
        Path file = dir.resolve("events.jsonl");
        new EventLog(file.toString(), new ObjectMapper()).append(List.of());
        assertFalse(Files.exists(file));
    }

    @Test
    void storedLineCarriesNoRawIp(@TempDir Path dir) throws IOException {
        // 원본 IP가 로그에 남으면 안 된다 — 서버가 해시만 담는지 확인.
        Path file = dir.resolve("events.jsonl");
        new EventLog(file.toString(), new ObjectMapper()).append(List.of(event("page_view")));
        String line = Files.readString(file);
        assertTrue(line.contains("\"ipHash\":\"abcd1234\""));
        assertFalse(line.contains("192.168"));
    }

    /** 읽는 쪽이 자리를 기억해 새 줄만 읽는다. 쓰는 중인 마지막 줄(줄바꿈 없음)은 다음 번에 읽는다. */
    @Test
    void readFromGivesOnlyCompleteNewLines(@TempDir Path dir) throws IOException {
        Path file = dir.resolve("events.jsonl");
        EventLog log = new EventLog(file.toString(), new ObjectMapper());
        assertEquals(0, log.readFrom(0, l -> fail("파일이 없으면 줄도 없다")));

        Files.writeString(file, "가\n나\n다", java.nio.charset.StandardCharsets.UTF_8);
        List<String> seen = new java.util.ArrayList<>();
        long next = log.readFrom(0, seen::add);
        assertEquals(List.of("가", "나"), seen);
        assertEquals("가\n나\n".getBytes(java.nio.charset.StandardCharsets.UTF_8).length, next);

        Files.writeString(file, "라\n", java.nio.charset.StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
        seen.clear();
        long after = log.readFrom(next, seen::add);
        assertEquals(List.of("다라"), seen, "반쪽이던 줄이 끝나면 그때 한 줄로 온다");
        assertEquals(Files.size(file), after);

        Files.writeString(file, "새\n", java.nio.charset.StandardCharsets.UTF_8);
        assertEquals(-1, log.readFrom(after, seen::add), "파일이 짧아졌으면 갈아끼운 것이다");
    }
}
