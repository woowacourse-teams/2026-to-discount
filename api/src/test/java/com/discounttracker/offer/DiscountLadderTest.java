package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class DiscountLadderTest {

    private DiscountTier fixed(Integer minOrder, Integer amount) {
        return new DiscountTier(minOrder, amount, null, null, null, null, null);
    }

    private DiscountTier percent(Integer minOrder, Integer amount, Integer pct, Integer cap) {
        return new DiscountTier(minOrder, amount, pct, cap, null, null, null);
    }

    @Test
    void floorIsTheSumAtTheLowestThreshold() {
        // 요기요 굽네치킨 실측(2026-07-31): 17,000원 이상 4,000원 고정
        // 메뉴할인 + 25,000원 이상 5%(상한 3,000)를 겹쳐 쓴다.
        //   17,000원 주문 -> 4,000
        //   25,000원 주문 -> 4,000 + 1,250 = 5,250
        // 대표값은 최저 문턱인 4,000이다.
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertEquals(4000, ladder.floorAmount());
    }

    @Test
    void ladderAccumulatesAtEachThreshold() {
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertEquals(List.of(4000, 5250), ladder.rungs().stream().map(DiscountLadder.Rung::amount).toList());
    }

    @Test
    void tierOrderDoesNotMatter() {
        DiscountLadder ladder = DiscountLadder.of(List.of(
                percent(25000, 1250, 5, 3000),
                fixed(17000, 4000)));
        assertEquals(4000, ladder.floorAmount());
    }

    @Test
    void missingMinOrderCountsAsNoThreshold() {
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(null, 2000),
                fixed(18000, 3000)));
        assertEquals(2000, ladder.floorAmount());
    }

    @Test
    void singleTierLadderIsThatTier() {
        assertEquals(4000, DiscountLadder.of(List.of(fixed(17000, 4000))).floorAmount());
    }

    @Test
    void emptyLadderHasNoFloor() {
        assertNull(DiscountLadder.of(List.of()).floorAmount());
    }

    @Test
    void tiersWithoutAmountAreSkipped() {
        // 금액을 못 읽은 구간은 더할 게 없다. 0으로 치면 사다리가 낮아진다.
        DiscountLadder ladder = DiscountLadder.of(List.of(
                fixed(17000, null),
                fixed(17000, 4000)));
        assertEquals(4000, ladder.floorAmount());
    }
}
