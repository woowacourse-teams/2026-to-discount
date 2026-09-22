package com.discounttracker.banner;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 날짜 대신 시각. 그날 포함인지를 값 자체가 말한다(설계 "날짜 대신 시각"). */
class BannerFieldsTest {

    private static Banner at(LocalDateTime from, LocalDateTime to) {
        return Banner.of("dunkin-20260922", "https://example.test/a")
                .brand("던킨").platform("ddangyo")
                .amountSpec(BannerAmount.of(Map.of("won", 7000)))
                .startsAt(from).endsAt(to).build();
    }

    @Test
    void seventeenOclockOpenStartsAtSeventeenNotMidnight() {
        Banner b = at(LocalDateTime.of(2026, 9, 22, 17, 0), LocalDateTime.of(2026, 9, 22, 23, 59));
        assertFalse(b.activeAt(LocalDateTime.of(2026, 9, 22, 16, 59)));
        assertTrue(b.activeAt(LocalDateTime.of(2026, 9, 22, 17, 0)));
        assertTrue(b.activeAt(LocalDateTime.of(2026, 9, 22, 23, 59)));
        assertFalse(b.activeAt(LocalDateTime.of(2026, 9, 23, 0, 0)));
    }

    @Test
    void oldCallersStillReadDates() {
        Banner b = at(LocalDateTime.of(2026, 9, 22, 17, 0), LocalDateTime.of(2026, 9, 30, 23, 59));
        assertEquals(LocalDate.of(2026, 9, 22), b.startsOn());
        assertEquals(LocalDate.of(2026, 9, 30), b.endsOn());
    }

    @Test
    void dateBuilderFillsTheDayBoundaries() {
        // 변환기가 endsOn: D를 endsAt: D T23:59로 옮긴다. 빌더도 같은 규칙이다.
        Banner b = Banner.of("x", "https://example.test/b")
                .startsOn(LocalDate.of(2026, 9, 22)).endsOn(LocalDate.of(2026, 9, 22)).build();
        assertEquals(LocalDateTime.of(2026, 9, 22, 0, 0), b.startsAt());
        assertEquals(LocalDateTime.of(2026, 9, 22, 23, 59), b.endsAt());
    }

    @Test
    void newFieldsRoundTripThroughToBuilder() {
        Banner b = Banner.of("y", "https://example.test/c")
                .brand("백억커피").platform("own").via("naverpay").group("naverpay-0921")
                .amountSpec(BannerAmount.of(Map.of("percent", 50, "kind", "cashback")))
                .targeted(true).firstCome("issue").untilSoldOut(true)
                .startsOn(LocalDate.of(2026, 9, 21)).endsOn(LocalDate.of(2026, 9, 21))
                .build();
        Banner copy = b.toBuilder().build();
        assertEquals("naverpay-0921", copy.group());
        assertEquals("naverpay", copy.via());
        assertEquals("issue", copy.firstCome());
        assertTrue(copy.isTargeted());
        assertTrue(copy.untilSoldOutFlag());
        assertEquals(50, copy.amountSpec().percent());
    }
}
