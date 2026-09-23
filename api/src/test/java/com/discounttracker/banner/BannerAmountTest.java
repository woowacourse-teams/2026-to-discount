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
        assertNull(BannerAmount.of(Map.of()));
        assertNull(BannerAmount.of(Map.of("won", List.of())));
        assertNull(BannerAmount.of(Map.of("won", List.of(5000))));
        assertNull(BannerAmount.of(Map.of("won", Arrays.asList(null, null))));
    }

    @Test
    void wonAndPercentTogetherIsRejected() {
        // 하나만 쓴다. 둘 다 적으면 어느 쪽이 화면에 나갈지 파일만 봐서는 모른다.
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("won", 8000, "percent", 30)));
        assertTrue(e.getMessage().contains("won"));
        assertTrue(e.getMessage().contains("percent"));
    }

    @Test
    void openUpperBoundWithPercentIsAlsoRejected() {
        // 하한만 있고 상한이 비어도 won을 쓴 것이다. percent와 같이 못 쓴다.
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("percent", 30, "won", Arrays.asList(5000, null))));
        assertTrue(e.getMessage().contains("won"));
        assertTrue(e.getMessage().contains("percent"));
    }

    @Test
    void negativeWonIsRejected() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("won", -5000)));
        assertTrue(e.getMessage().contains("wonMin"));
        assertTrue(e.getMessage().contains("-5000"));
    }

    @Test
    void negativePercentIsRejected() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("percent", -10)));
        assertTrue(e.getMessage().contains("percent"));
        assertTrue(e.getMessage().contains("-10"));
    }

    @Test
    void zeroWonIsAllowed() {
        // 0은 음수가 아니다. "0원 할인"은 무의미하지만 그 판단은 운영 콘솔의 몫이지
        // 이 레코드가 막을 계약은 아니다.
        BannerAmount a = BannerAmount.of(Map.of("won", 0));
        assertEquals(0, a.wonMin());
        assertEquals(0, a.wonMax());
        assertEquals(0, a.headline());
    }

    @Test
    void ordersATwoSlotListByValueNotByHowItWasWritten() {
        // `won: [8000, 1000]`을 적은 순서대로 읽으면 대표 정액이 1,000원이 된다.
        BannerAmount written = BannerAmount.of(Map.of("won", List.of(8000, 1000)));
        assertEquals(1000, written.wonMin());
        assertEquals(8000, written.wonMax());
        assertTrue(written.isRange());
    }

    @Test
    void refusesANegativeAmountInATwoSlotList() {
        // 한 칸짜리 음수는 negativeWonIsRejected가 이미 본다. 두 칸 목록에도 같은
        // 계약이 서는지 - 순서를 바로잡은 뒤에도 예외가 올라와야 한다(2026-09-24).
        assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("won", Arrays.asList(-1000, 8000))));
        assertThrows(IllegalArgumentException.class,
                () -> BannerAmount.of(Map.of("won", Arrays.asList(8000, -1000))));
    }
}
