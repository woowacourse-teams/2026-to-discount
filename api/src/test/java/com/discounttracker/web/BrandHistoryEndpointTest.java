package com.discounttracker.web;

import com.discounttracker.history.*;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class BrandHistoryEndpointTest {

    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-09T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    HistoryResponse call(String brand, String range) {
        var h = new OfferHistory(List.of(
                new BrandDay(LocalDate.parse("2026-10-08"), "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000),
                new BrandDay(LocalDate.parse("2026-10-09"), "coupangeats", "청년피자", DayState.UNCOLLECTED, null, 10000)),
                Map.of(LocalDate.parse("2026-10-08"), Set.of("coupangeats"), LocalDate.parse("2026-10-09"), Set.of()));
        return HistoryResponse.of(h, brand, range, LocalDate.now(CLOCK));
    }

    @Test
    void returnsBestSeriesAndSummary() {
        var r = call("청년피자", "1m");
        assertEquals("청년피자", r.brand());
        assertEquals(2, r.best().size());
        assertEquals("carried", r.best().get(1).line());
        assertEquals(10000, r.summary().maxEver());
    }

    @Test
    void unknownBrandIsEmptyNotError() {
        assertTrue(call("없는브랜드", "1m").best().isEmpty());
    }

    @Test
    void unknownRangeIsRejected() {
        assertThrows(IllegalArgumentException.class, () -> call("청년피자", "7y"));
    }
}
