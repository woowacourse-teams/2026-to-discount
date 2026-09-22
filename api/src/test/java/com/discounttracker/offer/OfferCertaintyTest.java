package com.discounttracker.offer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

/** 원장 qualifier에서 certainty를 끌어낸다. 원장은 안 고친다. */
class OfferCertaintyTest {

    private static OfferRecord record(String qualifier) {
        return new OfferRecord("baemin", "교촌치킨", 5000, qualifier, false, null, null, null,
                "2026-09-22T12:00:00+09:00", null, 20000, null, null, null, null, null, null,
                null, false);
    }

    @Test
    void ledgerQualifierBecomesCertainty() {
        LocalDate today = LocalDate.of(2026, 9, 22);
        assertEquals(Certainty.CAPPED, Offer.from(record("최대"), today).certainty());
        assertEquals(Certainty.RANDOM, Offer.from(record("랜덤"), today).certainty());
        assertEquals(Certainty.MENU_ONLY, Offer.from(record("특정메뉴"), today).certainty());
        assertEquals(Certainty.EXACT, Offer.from(record("최적"), today).certainty());
        assertEquals(Certainty.EXACT, Offer.from(record(null), today).certainty());
    }

    @Test
    void ledgerOffersAreAlwaysDiscount() {
        // 수집기가 kind를 적은 적이 없다. 배달앱에서 캐시백을 실제로 관측하면 그때 원장에
        // 선택 칸을 더한다. 옛 줄은 안 건드린다.
        assertEquals(AmountKind.DISCOUNT, Offer.from(record("최대"), LocalDate.of(2026, 9, 22)).kind());
    }

    @Test
    void responseCarriesBothQualifierAndCertaintyDuringTheTransition() throws Exception {
        // 드리프트 5. API와 웹이 따로 배포된다. 웹이 certainty를 아직 못 읽어도 qualifier로 선다.
        String json = new ObjectMapper()
                .writeValueAsString(Offer.from(record("최대"), LocalDate.of(2026, 9, 22)));
        assertTrue(json.contains("\"qualifier\":\"최대\""), json);
        assertTrue(json.contains("\"certainty\":\"capped\""), json);
        assertTrue(json.contains("\"kind\":\"discount\""), json);
        assertTrue(json.contains("\"fromBanner\":false"), json);
    }
}
