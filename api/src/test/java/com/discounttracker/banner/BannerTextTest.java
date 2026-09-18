package com.discounttracker.banner;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** 구조 필드에서 만든 문구가 사람이 손으로 적던 문구와 글자까지 같은지(설계 25). */
class BannerTextTest {

    private static BannerSpec.BannerItem item(String brand, Integer amount, Integer minOrder, String opensAt) {
        return new BannerSpec.BannerItem(brand, amount, minOrder, opensAt);
    }

    private static BannerSpec spec(List<BannerSpec.BannerItem> items, List<Integer> range, String opensAt,
                                   String limit, String usage, String channel, String event, String note) {
        return new BannerSpec(items, range, opensAt, limit, usage, channel, null, event, note);
    }

    @Test
    void firstComeBundleReadsLikeTheHandWrittenBanner() {
        // 2026-09-18 선착순: 브랜드마다 시각과 금액이 다르다.
        BannerSpec s = spec(List.of(item("버거킹", 4000, null, "10:00"), item("본도시락", 3000, null, "11:00"),
                        item("써브웨이", 2000, null, "11:00"), item("호식이두마리치킨", 6000, null, "15:00")),
                null, null, "first_come", "use", null, null, null);
        assertEquals("4/3/2/6천원", BannerText.amount(s));
        assertEquals("10시~ 버거킹 · 11시~ 본도시락 · 써브웨이 · 15시~ 호식이두마리치킨 / 사용(발급X) 선착순",
                BannerText.extra(s, null));
        assertEquals(List.of("버거킹", "본도시락", "써브웨이", "호식이두마리치킨"), BannerText.brands(s));
        assertNull(BannerText.minOrder(s));
    }

    @Test
    void singleBrandOneDayEvent() {
        BannerSpec s = spec(List.of(item("뚜레쥬르", 6000, 18000, null)), null, null, "first_come", "use", null,
                "뚜쥬데이", null);
        LocalDate d = LocalDate.of(2026, 9, 17);
        assertEquals("6,000원", BannerText.amount(s));
        assertEquals("9월 17일 하루", BannerText.period(s, d, d));
        assertEquals(18000, BannerText.minOrder(s));
        assertEquals("뚜쥬데이 / 18,000원↑, 사용(발급X) 선착순", BannerText.extra(s, 18000));
    }

    @Test
    void randomCouponWithUnknownLowerBound() {
        // 하한은 모를 때가 많다 — null을 허용하고 "최대"만 쓴다(사용자 결정 09-18).
        BannerSpec s = spec(List.of(item("bhc", null, null, null)), Arrays.asList(null, 7000), null,
                "random", null, null, "일일 슈퍼딜", null);
        assertEquals("최대 7,000원", BannerText.amount(s));
        assertEquals("일일 슈퍼딜 / 랜덤쿠폰", BannerText.extra(s, null));
        assertEquals("3,000~8,000원", BannerText.amount(spec(null, List.of(3000, 8000), null, null, null, null, null, null)));
    }

    @Test
    void dailyOpeningTimeInPeriod() {
        BannerSpec s = spec(null, null, "11:00", null, null, null, null, null);
        assertEquals("매일 오전 11시 오픈", BannerText.period(s, LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 30)));
        assertEquals("오후 5시 오픈", BannerText.period(spec(null, null, "17:00", null, null, null, null, null),
                LocalDate.of(2026, 9, 18), LocalDate.of(2026, 9, 18)));
        assertEquals("~9/30", BannerText.period(spec(null, null, null, null, null, null, null, null),
                LocalDate.of(2026, 9, 14), LocalDate.of(2026, 9, 30)));
    }

    @Test
    void amountRangeNeedsAnUpperBound() {
        assertThrows(IllegalArgumentException.class,
                () -> new BannerSpec(null, Arrays.asList(3000, null), null, null, null, null, null, null, null));
        assertThrows(IllegalArgumentException.class,
                () -> new BannerSpec(List.of(item("", 1, null, null)), null, null, null, null, null, null, null, null));
    }
}
