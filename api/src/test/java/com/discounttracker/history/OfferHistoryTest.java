// mono/api/src/test/java/com/discounttracker/history/OfferHistoryTest.java
package com.discounttracker.history;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class OfferHistoryTest {

    static LocalDate d(String s) { return LocalDate.parse(s); }

    static BrandDay day(String date, String platform, String brand, DayState s, WithheldReason r, Integer max) {
        return new BrandDay(d(date), platform, brand, s, r, max);
    }

    static Map<LocalDate, Set<String>> cov(String... dateAndPlatforms) {
        Map<LocalDate, Set<String>> m = new TreeMap<>();
        for (String x : dateAndPlatforms) {
            String[] p = x.split("=");
            m.put(d(p[0]), p.length > 1 ? Set.of(p[1].split(",")) : Set.of());
        }
        return m;
    }

    @Test
    void cheongnyeonPizzaCaseIsNotNewAfterAFailedCouponBoxDay() {
        // 10-08 허브 10,000원 반영, 10-09 쿠폰함 실패여도 허브는 반영. 10-09의 10,000원은 신규가 아니다.
        var h = new OfferHistory(List.of(
                day("2026-10-08", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000),
                day("2026-10-09", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000)),
                cov("2026-10-08=coupangeats", "2026-10-09=coupangeats"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("coupangeats", "청년피자", 10000, d("2026-10-09")));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("coupangeats", "청년피자", 7500, d("2026-10-09")));
        assertEquals(OfferHistory.Novelty.NEW, h.novelty("coupangeats", "청년피자", 11000, d("2026-10-09")));
    }

    @Test
    void uncollectedDaysAreSkippedBackToTheLastCollectedDay() {
        // 월요일 전수로만 보이는 브랜드: 화~일 uncollected, 다음 월요일 같은 금액은 신규 아님.
        var h = new OfferHistory(List.of(
                day("2026-10-05", "ddangyo", "BBQ", DayState.PUBLISHED, null, 3000),
                day("2026-10-06", "ddangyo", "BBQ", DayState.UNCOLLECTED, null, 3000),
                day("2026-10-07", "ddangyo", "BBQ", DayState.UNCOLLECTED, null, 3000)),
                cov("2026-10-05=ddangyo", "2026-10-06=ddangyo", "2026-10-07=ddangyo"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("ddangyo", "BBQ", 3000, d("2026-10-12")));
    }

    @Test
    void absentOnPreviousCollectedDayMakesNextAppearanceNew() {
        var h = new OfferHistory(List.of(
                day("2026-10-07", "baemin", "KFC", DayState.PUBLISHED, null, 5000),
                day("2026-10-08", "baemin", "KFC", DayState.ABSENT, null, null)),
                cov("2026-10-07=baemin", "2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NEW, h.novelty("baemin", "KFC", 5000, d("2026-10-09")));
    }

    @Test
    void brandNeverSeenOnACollectedPlatformIsNew() {
        var h = new OfferHistory(List.of(day("2026-10-08", "baemin", "BBQ", DayState.PUBLISHED, null, 3000)),
                cov("2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NEW, h.novelty("baemin", "노모어피자", 7000, d("2026-10-09")));
    }

    @Test
    void platformFailedDayIsSkippedEvenIfOthersRan() {
        var h = new OfferHistory(List.of(day("2026-10-07", "coupangeats", "KFC", DayState.PUBLISHED, null, 7000)),
                cov("2026-10-07=coupangeats", "2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("coupangeats", "KFC", 7000, d("2026-10-09")));
    }

    @Test
    void emptyHistoryIsUnknown() {
        assertEquals(OfferHistory.Novelty.UNKNOWN, OfferHistory.empty().novelty("baemin", "BBQ", 1, d("2026-10-09")));
        assertNull(OfferHistory.Novelty.UNKNOWN.asBoolean());
    }

    @Test
    void untrustedWithheldIsSkippedTrustedCounts() {
        var h = new OfferHistory(List.of(
                day("2026-10-07", "baemin", "BBQ", DayState.PUBLISHED, null, 3000),
                day("2026-10-08", "baemin", "BBQ", DayState.WITHHELD, WithheldReason.STAGE_SUSPECT, null)),
                cov("2026-10-07=baemin", "2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NOT_NEW, h.novelty("baemin", "BBQ", 3000, d("2026-10-09")));
        var h2 = new OfferHistory(List.of(
                day("2026-10-08", "baemin", "BBQ", DayState.WITHHELD, WithheldReason.HELD_HUMAN, 4000)),
                cov("2026-10-08=baemin"));
        assertEquals(OfferHistory.Novelty.NEW, h2.novelty("baemin", "BBQ", 5000, d("2026-10-09")));
    }

    @Test
    void everyWithheldReasonAnswersBothQuestions() {
        for (WithheldReason r : WithheldReason.values()) {
            assertEquals(r.trustsValue(), r.countsAsCollected(), r.name());
        }
    }

    @Test
    void bestSeriesIsPlatformAgnosticMaxWithCarriedAndBreak() {
        var h = new OfferHistory(List.of(
                day("2026-10-05", "baemin", "BBQ", DayState.PUBLISHED, null, 3000),
                day("2026-10-05", "yogiyo", "BBQ", DayState.PUBLISHED, null, 5000),
                day("2026-10-06", "baemin", "BBQ", DayState.UNCOLLECTED, null, 3000),
                day("2026-10-06", "yogiyo", "BBQ", DayState.WITHHELD, WithheldReason.STAGE_SUSPECT, null),
                day("2026-10-07", "baemin", "BBQ", DayState.ABSENT, null, null)),
                cov("2026-10-04=baemin", "2026-10-05=baemin,yogiyo", "2026-10-06=baemin", "2026-10-07=baemin"));
        var s = h.bestSeries("BBQ", d("2026-10-01"), d("2026-10-07"));
        assertEquals(List.of(
                new OfferHistory.Point(d("2026-10-05"), 5000, "solid", null),
                new OfferHistory.Point(d("2026-10-06"), 5000, "carried", "stage_suspect"),
                new OfferHistory.Point(d("2026-10-07"), null, "break", null)), s);
    }

    @Test
    void summaryCountsDaysSinceHigher() {
        var h = new OfferHistory(List.of(
                day("2026-09-23", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000),
                day("2026-10-01", "coupangeats", "청년피자", DayState.PUBLISHED, null, 7500),
                day("2026-10-09", "coupangeats", "청년피자", DayState.PUBLISHED, null, 10000)),
                cov("2026-09-23=coupangeats", "2026-10-01=coupangeats", "2026-10-09=coupangeats"));
        var sum = h.summary("청년피자", d("2026-10-09"));
        assertEquals(new OfferHistory.Summary(10000, d("2026-09-23"), 10000, 16), sum);
    }
}
