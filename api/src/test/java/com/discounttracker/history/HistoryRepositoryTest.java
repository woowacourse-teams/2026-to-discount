package com.discounttracker.history;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class HistoryRepositoryTest {

    @Test
    void readsDaysAndCoverage() {
        String json = """
                {"generatedAt":"2026-10-09T01:46:10+09:00",
                 "days":[{"date":"2026-10-08","platform":"coupangeats","brand":"청년피자","state":"published","max":10000}],
                 "coverage":[{"date":"2026-10-08","platforms":["coupangeats"]}]}
                """;
        var repo = new HistoryRepository(new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
        assertTrue(repo.reload());
        assertEquals(OfferHistory.Novelty.NOT_NEW,
                repo.current().novelty("coupangeats", "청년피자", 10000, LocalDate.parse("2026-10-09")));
    }

    @Test
    void unknownStateOrReasonDoesNotDropWholeHistory() {
        String json = """
                {"days":[{"date":"2026-10-08","platform":"coupangeats","brand":"청년피자","state":"published","max":10000},
                         {"date":"2026-10-08","platform":"baemin","brand":"청년피자","state":"brand-new-state","reason":"odd"}],
                 "coverage":[{"date":"2026-10-08","platforms":["coupangeats","baemin"]}]}
                """;
        var repo = new HistoryRepository(new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
        assertTrue(repo.reload());
        assertEquals(OfferHistory.Novelty.NOT_NEW,
                repo.current().novelty("coupangeats", "청년피자", 10000, LocalDate.parse("2026-10-09")));
    }

    @Test
    void unknownStringsMapToUnknownAndNull() {
        assertEquals(DayState.UNKNOWN, DayState.of("brand-new-state"));
        assertEquals(DayState.UNKNOWN, DayState.of(""));
        assertNull(WithheldReason.of("odd"));
        assertEquals(WithheldReason.EXPIRED, WithheldReason.of("expired"));
    }

    @Test
    void seriesBeforeCoverageStartIsEmpty() {
        var h = new OfferHistory(
                List.of(new BrandDay(LocalDate.parse("2026-10-08"), "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000)),
                Map.of(LocalDate.parse("2026-10-08"), Set.of("coupangeats")));
        LocalDate before = LocalDate.parse("2026-10-01");
        assertEquals(List.of(), h.bestSeries("청년피자", before.minusDays(5), before));
        assertEquals(new OfferHistory.Summary(null, null, null, null), h.summary("청년피자", before));
    }

    @Test
    void missingFileGivesEmptyHistoryNotACrash() {
        var repo = new HistoryRepository(new FileSystemResource("C:/none/history.json"));
        assertFalse(repo.reload());
        assertTrue(repo.current().isEmpty());
    }

    @Test
    void brokenFileGivesEmptyHistory() {
        var repo = new HistoryRepository(new ByteArrayResource("{".getBytes(StandardCharsets.UTF_8)));
        assertFalse(repo.reload());
        assertTrue(repo.current().isEmpty());
    }
}
