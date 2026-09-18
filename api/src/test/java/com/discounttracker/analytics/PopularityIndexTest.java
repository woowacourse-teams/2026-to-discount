package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** 인기순(2026-09-19): 최근 14일의 클릭·펼침을 브랜드별로 가중합한다. */
class PopularityIndexTest {

    @Test
    void weightsRecentClicksAndIgnoresOldOrUnrelatedEvents(@TempDir Path dir) throws Exception {
        Path log = dir.resolve("events.jsonl");
        Files.writeString(log, String.join("\n",
                "{\"ts\":\"2026-09-18T10:00:00+09:00\",\"event\":\"offer_link_click\",\"props\":{\"brand\":\"bhc\"}}",
                "{\"ts\":\"2026-09-18T10:01:00+09:00\",\"event\":\"brand_expand\",\"props\":{\"brand\":\"bhc\"}}",
                "{\"ts\":\"2026-09-18T10:02:00+09:00\",\"event\":\"banner_click\",\"props\":{\"brand\":\"BBQ\"}}",
                "{\"ts\":\"2026-08-01T10:00:00+09:00\",\"event\":\"offer_link_click\",\"props\":{\"brand\":\"bhc\"}}",
                "{\"ts\":\"2026-09-18T10:03:00+09:00\",\"event\":\"brand_impression\",\"props\":{\"brand\":\"bhc\"}}",
                "not json",
                ""), StandardCharsets.UTF_8);
        Clock clock = Clock.fixed(Instant.parse("2026-09-19T00:00:00Z"), ZoneId.of("Asia/Seoul"));
        PopularityIndex idx = new PopularityIndex(new EventLog(log.toString(), new ObjectMapper()), new ObjectMapper(), clock);

        assertEquals(4, idx.scoreOf("bhc"));      // 클릭 3 + 펼침 1. 8월 클릭과 노출은 안 센다
        assertEquals(2, idx.scoreOf("BBQ"));
        assertEquals(0, idx.scoreOf("없는브랜드"));
    }
}
