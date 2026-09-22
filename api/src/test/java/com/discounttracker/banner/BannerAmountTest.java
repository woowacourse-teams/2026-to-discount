package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Certainty;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** yml의 amount 한 덩이를 읽는다. 모양이 하나다(설계 "amount가 값의 유형을 갖는다"). */
class BannerAmountTest {

    @Test
    void plainWonIsExact() {
        BannerAmount a = BannerAmount.of(Map.of("won", 8000));
        assertEquals(8000, a.wonMin());
        assertEquals(8000, a.wonMax());
        assertFalse(a.isRange());
        assertEquals(Certainty.EXACT, a.certainty());
        assertEquals(AmountKind.DISCOUNT, a.kind());
        assertEquals(8000, a.headline());
    }

    @Test
    void openLowerBoundIsCapped() {
        // 최소를 모르는 범위. "최대 8,000원"으로 나간다.
        BannerAmount a = BannerAmount.of(Map.of("won", Arrays.asList(null, 8000)));
        assertNull(a.wonMin());
        assertEquals(8000, a.wonMax());
        assertTrue(a.isRange());
        assertEquals(Certainty.CAPPED, a.certainty());
        assertEquals(8000, a.headline());
    }

    @Test
    void randomBeatsCapped() {
        // 뽑기 배너는 대개 "최대 8,000원"으로도 적힌다. 랜덤이 먼저다.
        BannerAmount a = BannerAmount.of(Map.of("won", List.of(1000, 8000), "random", true));
        assertEquals(Certainty.RANDOM, a.certainty());
        assertEquals(8000, a.headline());
    }

    @Test
    void percentHasNoWonAmount() {
        BannerAmount a = BannerAmount.of(Map.of("percent", 30));
        assertEquals(30, a.percent());
        assertNull(a.headline());
        assertEquals(Certainty.PERCENT, a.certainty());
    }

    @Test
    void cashbackIsAKindNotALimit() {
        // 2026-09-21 백억커피 네이버페이 50% 적립. limit이 아니라 kind다.
        BannerAmount a = BannerAmount.of(Map.of("percent", 50, "kind", "cashback"));
        assertEquals(AmountKind.CASHBACK, a.kind());
        assertEquals(Certainty.PERCENT, a.certainty());
    }

    @Test
    void missingOrMalformedReturnsNull() {
        assertNull(BannerAmount.of(null));
        assertNull(BannerAmount.of("8,000원"));
        assertNull(BannerAmount.of(Map.of("kind", "cashback")));
    }

    @Test
    void wonAndPercentTogetherIsRejected() {
        // 하나만 쓴다. 둘 다 적으면 어느 쪽이 화면에 나갈지 파일만 봐서는 모른다.
        assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("won", 8000, "percent", 30)));
    }
}
