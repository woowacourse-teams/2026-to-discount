package com.discounttracker.insight;

import com.discounttracker.history.*;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class InsightServiceTest {

    static LocalDate d(String s) { return LocalDate.parse(s); }

    static BrandDay day(LocalDate date, String platform, String brand, DayState s, Integer max) {
        return new BrandDay(date, platform, brand, s, null, max);
    }

    /** from부터 n일, 모든 앱이 수집된 날로 둔다. */
    static Map<LocalDate, Set<String>> cov(LocalDate from, int n) {
        Map<LocalDate, Set<String>> m = new TreeMap<>();
        for (int i = 0; i < n; i++) m.put(from.plusDays(i), Set.copyOf(InsightService.PLATFORMS));
        return m;
    }

    static List<InsightService.Series> series(List<BrandDay> days, Map<LocalDate, Set<String>> cov) {
        var h = new OfferHistory(days, cov);
        return InsightService.series(h, new ArrayList<>(h.coverage().keySet()));
    }

    @Test
    void unseenDaysAreCarriedOrNullNeverZeroAndAbsentIsZero() {
        LocalDate s = d("2026-10-01");
        var all = series(List.of(
                day(s, "baemin", "BBQ", DayState.PUBLISHED, 3000),
                day(s.plusDays(1), "baemin", "BBQ", DayState.UNCOLLECTED, null),
                // 10-03은 행이 없다
                day(s.plusDays(3), "baemin", "BBQ", DayState.ABSENT, null),
                // 처음부터 못 본 쌍은 값이 없다(0이 아니다)
                day(s, "yogiyo", "BBQ", DayState.UNKNOWN, null)), cov(s, 4));
        var bbq = all.stream().filter(x -> x.platform.equals("baemin")).findFirst().orElseThrow();
        assertArrayEquals(new Integer[]{3000, 3000, 3000, 0}, bbq.v);
        assertArrayEquals(new boolean[]{true, false, false, true}, bbq.obs);
        var yogiyo = all.stream().filter(x -> x.platform.equals("yogiyo")).findFirst().orElseThrow();
        assertArrayEquals(new Integer[]{null, null, null, null}, yogiyo.v);
    }

    @Test
    void carryStopsAfterFourteenDays() {
        LocalDate s = d("2026-10-01");
        var bbq = series(List.of(day(s, "ddangyo", "BBQ", DayState.PUBLISHED, 5000)), cov(s, 16)).get(0);
        assertEquals(5000, bbq.v[14]);
        assertNull(bbq.v[15]);
    }

    @Test
    void shareIsNullBelowThirtyComparisons() {
        // 두 앱이 같은 브랜드를 매일 할인한다. 쿠팡이츠가 늘 더 크다. 비교 수 = 날 수.
        for (int n : new int[]{29, 30}) {
            LocalDate s = d("2026-09-14");
            List<BrandDay> days = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                days.add(day(s.plusDays(i), "baemin", "BBQ", DayState.PUBLISHED, 3000));
                days.add(day(s.plusDays(i), "coupangeats", "BBQ", DayState.PUBLISHED, 5000));
            }
            var body = InsightService.compute(new OfferHistory(days, cov(s, n)), List.of(),
                    ZonedDateTime.of(2026, 11, 18, 9, 0, 0, 0, ZoneId.of("Asia/Seoul")));
            @SuppressWarnings("unchecked")
            var withCarried = (Map<String, Object>) ((Map<String, Object>) body.get("compare")).get("withCarried");
            @SuppressWarnings("unchecked")
            var share = (Map<String, Object>) withCarried.get("share");
            assertEquals(n, withCarried.get("n"));
            if (n < 30) assertNull(share.get("coupangeats"));
            else assertEquals(1.0, share.get("coupangeats"));
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void trendDayCarriesMaxAndSumOfBrandsOnDiscount() {
        LocalDate s = d("2026-10-01");
        var h = new OfferHistory(List.of(
                day(s, "baemin", "BBQ", DayState.PUBLISHED, 3000),
                day(s, "baemin", "bhc", DayState.PUBLISHED, 5000),
                day(s, "yogiyo", "BBQ", DayState.ABSENT, null)), cov(s, 1));
        var out = InsightService.compute(h, List.of(), s.atStartOfDay(ZoneId.of("Asia/Seoul")));
        var days = (List<Map<String, Object>>) ((Map<String, Object>) out.get("trend")).get("days");
        var last = days.get(days.size() - 1);
        assertEquals(5000, ((Map<String, Object>) last.get("max")).get("baemin"));
        assertEquals(8000, ((Map<String, Object>) last.get("sum")).get("baemin"));
        assertNull(((Map<String, Object>) last.get("max")).get("yogiyo"));
    }
}
