package com.discounttracker.analytics;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** 인기(2026-10-14): 링크나 배너를 누른 서로 다른 방문자 수. 오늘(24시간)과 이번 주(7일). */
class PopularityIndexTest {

    private static String ev(String ts, String event, String visitor, String brand, String extra) {
        return "{\"ts\":\"" + ts + "\",\"event\":\"" + event + "\",\"visitorId\":\"" + visitor + "\""
                + extra + ",\"props\":{\"brand\":\"" + brand + "\"}}";
    }

    @Test
    void countsPeopleNotClicksPerWindow(@TempDir Path dir) throws Exception {
        Path log = dir.resolve("events.jsonl");
        Files.writeString(log, String.join("\n",
                // 오늘: 한 사람이 bhc를 세 번 눌러도 1, 다른 사람이 배너로 1 → 2
                ev("2026-10-14T12:00:00+09:00", "offer_link_click", "v1", "bhc", ""),
                ev("2026-10-14T12:01:00+09:00", "offer_link_click", "v1", "bhc", ""),
                ev("2026-10-14T12:02:00+09:00", "offer_link_click", "v1", "bhc", ""),
                ev("2026-10-14T12:03:00+09:00", "banner_click", "v2", "bhc", ""),
                // 어제(24~48시간 전): 등락용 yesterday와 이번 주에 든다
                ev("2026-10-13T10:00:00+09:00", "offer_link_click", "v9", "BBQ", ""),
                // 사흘 전: 이번 주에만 든다
                ev("2026-10-11T12:00:00+09:00", "offer_link_click", "v3", "bhc", ""),
                ev("2026-10-11T12:00:00+09:00", "offer_link_click", "v3", "BBQ", ""),
                // 8일 전, 펼침, 노출, 개발 접속, 크롤러, 방문자 없음은 안 센다
                ev("2026-10-06T12:00:00+09:00", "offer_link_click", "v4", "bhc", ""),
                ev("2026-10-14T12:04:00+09:00", "brand_expand", "v5", "bhc", ""),
                ev("2026-10-14T12:05:00+09:00", "brand_impression", "v6", "bhc", ""),
                ev("2026-10-14T12:06:00+09:00", "offer_link_click", "v7", "bhc", ",\"dev\":true"),
                ev("2026-10-14T12:07:00+09:00", "offer_link_click", "v8", "BBQ", ",\"bot\":\"Googlebot\""),
                "{\"ts\":\"2026-10-14T12:08:00+09:00\",\"event\":\"offer_link_click\",\"props\":{\"brand\":\"bhc\"}}",
                "not json",
                ""), StandardCharsets.UTF_8);
        Clock clock = Clock.fixed(Instant.parse("2026-10-14T06:00:00Z"), ZoneId.of("Asia/Seoul"));
        PopularityIndex idx = new PopularityIndex(new EventLog(log.toString(), new ObjectMapper()), new ObjectMapper(), clock);

        assertEquals(2, idx.todayOf("bhc"));
        assertEquals(3, idx.scoreOf("bhc"));      // v1, v2, v3
        assertEquals(0, idx.todayOf("BBQ"));
        assertEquals(2, idx.scoreOf("BBQ"));      // v3, v9. 크롤러 v8은 안 센다
        assertEquals(1, idx.yesterdayOf("BBQ"));  // v9만
        assertEquals(0, idx.yesterdayOf("bhc"));
        assertEquals(0, idx.scoreOf("없는브랜드"));
    }

    /** 다시 셀 때 새로 붙은 누름만 더 읽는다. 7일이 지난 누름은 표에서 빠진다. */
    @Test
    void addsNewClicksAndDropsOldOnReload(@TempDir Path dir) throws Exception {
        Path log = dir.resolve("events.jsonl");
        Files.writeString(log, ev("2026-10-14T12:00:00+09:00", "offer_link_click", "v1", "bhc", "") + "\n",
                StandardCharsets.UTF_8);
        java.util.concurrent.atomic.AtomicReference<Instant> now =
                new java.util.concurrent.atomic.AtomicReference<>(Instant.parse("2026-10-14T06:00:00Z"));
        Clock clock = new Clock() {
            public ZoneId getZone() { return ZoneId.of("Asia/Seoul"); }
            public Clock withZone(ZoneId z) { return this; }
            public Instant instant() { return now.get(); }
        };
        PopularityIndex idx = new PopularityIndex(new EventLog(log.toString(), new ObjectMapper()), new ObjectMapper(), clock);
        assertEquals(1, idx.todayOf("bhc"));

        Files.writeString(log, ev("2026-10-14T13:00:00+09:00", "offer_link_click", "v2", "bhc", "") + "\n",
                StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
        idx.reload();
        assertEquals(2, idx.todayOf("bhc"));

        now.set(Instant.parse("2026-10-22T06:00:00Z"));          // 8일 뒤
        idx.reload();
        assertEquals(0, idx.scoreOf("bhc"));
    }
}
