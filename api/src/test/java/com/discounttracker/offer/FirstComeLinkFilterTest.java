package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.*;

/** 오픈 전 배민 선착순은 배짱할인 허브로, 오픈 뒤에는 원래 링크로(2026-10-24 사용자). */
class FirstComeLinkFilterTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 24);

    private static Offer firstCome(String platform, String conditions, String link) {
        return Offer.from(OfferRecord.builder(platform, "노랑통닭")
                .amount(6000)
                .section("배짱할인 주말핫딜 선착순")
                .conditions(conditions)
                .link(link)
                .capturedAt("2026-10-24T09:00:00+09:00")
                .minOrderAmount(19000)
                .soldOut(false)
                .build(), TODAY);
    }

    @Test
    void beforeOpeningTheLinkIsTheBaejjangHub() {
        Offer o = FirstComeLinkFilter.apply(firstCome("baemin", "오전 10시 오픈 선착순", null), LocalTime.of(9, 59));
        assertEquals(FirstComeLinkFilter.BAEMIN_BAEJJANG_HUB_LINK, o.link());
    }

    @Test
    void fromOpeningTimeTheLinkIsLeftAlone() {
        Offer o = FirstComeLinkFilter.apply(firstCome("baemin", "오전 10시 오픈 선착순", null), LocalTime.of(10, 0));
        assertNull(o.link());
    }

    @Test
    void afternoonHoursAreRead() {
        assertEquals(LocalTime.of(17, 0), FirstComeLinkFilter.opensAt("오후 5시 오픈 선착순"));
        assertEquals(LocalTime.of(12, 0), FirstComeLinkFilter.opensAt("오후 12시 오픈"));
        assertEquals(LocalTime.of(0, 0), FirstComeLinkFilter.opensAt("오전 12시 오픈"));
        assertEquals(LocalTime.of(10, 30), FirstComeLinkFilter.opensAt("오전 10시 30분 오픈"));
        assertNull(FirstComeLinkFilter.opensAt("오전 13시 오픈"));
        assertNull(FirstComeLinkFilter.opensAt("오전 0시 오픈"));
        assertNull(FirstComeLinkFilter.opensAt("오전 10시 70분 오픈"));
        assertNull(FirstComeLinkFilter.opensAt("선착순"));
        assertNull(FirstComeLinkFilter.opensAt(null));
    }

    @Test
    void offersThatAreNotBaeminFirstComeOrAlreadyHaveALinkAreUntouched() {
        LocalTime early = LocalTime.of(9, 0);
        assertNull(FirstComeLinkFilter.apply(firstCome("yogiyo", "오전 10시 오픈 선착순", null), early).link());
        assertEquals("https://own", FirstComeLinkFilter.apply(firstCome("baemin", "오전 10시 오픈 선착순", "https://own"), early).link());
        assertNull(FirstComeLinkFilter.apply(firstCome("baemin", "시각 없음", null), early).link());
        Offer regular = Offer.from(OfferRecord.builder("baemin", "교촌치킨").amount(3000).section("브랜드관 쿠폰")
                .conditions("오전 10시 오픈").capturedAt("2026-10-24T09:00:00+09:00").minOrderAmount(19000).soldOut(false).build(), TODAY);
        assertNull(FirstComeLinkFilter.apply(regular, early).link());
    }
}
