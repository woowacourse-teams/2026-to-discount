package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRecord;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** 혜택 칩(네이버페이, 포장)이 고르는 칸은 배너에서만 온다. 원장 오퍼는 null이다. */
class BannerOffersViaTest {

    @Test
    void bannerOfferCarriesViaAndChannel() {
        Banner b = Banner.of("npay", "https://example.test").brand("설빙").platform("own").via("naverpay")
                .spec(new BannerSpec(null, "포장", null, null, null))
                .amountSpec(new BannerAmount(null, null, 50, false, AmountKind.POINTS))
                .startsAt(LocalDateTime.of(2026, 11, 25, 0, 0)).endsAt(LocalDateTime.of(2026, 11, 29, 23, 59))
                .build();
        Clock clock = Clock.fixed(LocalDateTime.of(2026, 11, 26, 12, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant(),
                ZoneId.of("Asia/Seoul"));
        List<OfferRecord> records = BannerOffers.of(List.of(b), clock);
        assertEquals(1, records.size());
        Offer o = Offer.from(records.get(0), LocalDate.of(2026, 11, 26));
        assertEquals("naverpay", o.via());
        assertEquals("포장", o.channel());
    }

    @Test
    void ledgerOfferHasNoViaOrChannel() {
        Offer o = Offer.from(OfferRecord.builder("baemin", "BBQ").build(), LocalDate.of(2026, 11, 26));
        assertNull(o.via());
        assertNull(o.channel());
    }
}
