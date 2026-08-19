package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfferRecordTest {

    private static final LocalDate TODAY = LocalDate.parse("2026-08-13");

    private OfferRecord record(Integer amount, String tierMode, List<DiscountTier> tiers) {
        return new OfferRecord("yogiyo", "굽네치킨", amount, "최소", false,
                "discount", null, "최소 4,000원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, tierMode, tiers, null, null, null, false);
    }

    private DiscountTier fixed(Integer minOrder, Integer amount) {
        return new DiscountTier(minOrder, amount, null, null, null, null, null);
    }

    private DiscountTier percent(Integer minOrder, Integer amount, Integer pct, Integer cap) {
        return new DiscountTier(minOrder, amount, pct, cap, null, null, null);
    }

    @Test
    void nullTierModeIsExclusive() {
        // tracker가 tier_mode를 실어 보내기 전의 export.json에는 이 필드가
        // 아예 없다. 없으면 지금까지의 해석(택일)이다.
        assertFalse(record(4000, null, null).isCumulative());
    }

    @Test
    void cumulativeWithNullTiersFallsBackToAmount() {
        // schema.py는 cumulative 레코드에 구간 2개 이상을 요구하지만, 필드
        // 전체가 방어적으로 null 허용이라 tiers==null이 와도 NPE 대신 원장
        // amount로 내려가야 한다 — exclusive 갈래와 같은 fallback.
        OfferRecord r = record(4000, "cumulative", null);
        assertEquals(4000, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeAmountComesFromTheLadderBest() {
        // 굽네치킨: 사다리는 17,000원에 4,000 / 25,000원에 5,250이고
        // 대표값은 최고 문턱인 5,250이다("최적" 배지가 함께 붙는다).
        OfferRecord r = record(5250, "cumulative", List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertTrue(r.isCumulative());
        assertEquals(5250, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeIgnoresTheLedgerAmountWhenItDisagrees() {
        // 원장 값이 어긋나 있어도 화면에는 계산값이 나간다. 어긋남 자체는
        // tracker의 test_ledger_consistency가 잡는다.
        OfferRecord r = record(9999, "cumulative", List.of(
                fixed(17000, 4000),
                percent(25000, 1250, 5, 3000)));
        assertEquals(5250, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeSkipsExpiredTiers() {
        // 만료된 구간은 사다리에 안 들어간다. 17,000원 칸이 끝났으면
        // 남은 건 25,000원 칸뿐이고 대표값도 그쪽이 된다.
        OfferRecord r = new OfferRecord("yogiyo", "굽네치킨", 4000, "최소", false,
                "discount", null, "최소 4,000원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, "cumulative", List.of(
                        new DiscountTier(17000, 4000, null, null, null, null, "2026-08-01"),
                        new DiscountTier(25000, 1250, 5, 3000, null, null, null)),
                null, null, null, false);
        assertEquals(1250, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeSkipsSoldOutTiers() {
        // 품절 구간은 못 받는 금액이라 더하면 안 된다. liveTiers는 만료만
        // 거르므로(상세 패널이 품절 구간도 보여줘야 한다) 합산 전에 한 번 더
        // 거른다 — 쿠팡이츠 메가MGC커피 실측과 같은 이유.
        OfferRecord r = new OfferRecord("yogiyo", "굽네치킨", 4000, "최소", false,
                "discount", null, "최소 4,000원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, "cumulative", List.of(
                        new DiscountTier(17000, 4000, null, null, null, null, null),
                        new DiscountTier(17000, 9999, null, null, null, true, null)),
                null, null, null, false);
        assertEquals(4000, r.amountAsOf(TODAY));
    }

    @Test
    void exclusiveKeepsTheExistingLoweringRule() {
        // exclusive는 아무것도 안 바뀐다 — 원장 대표값을 쓰되 살아 있는
        // 구간이 전부 그보다 작으면 그만큼 내린다.
        OfferRecord r = record(9000, "exclusive", List.of(fixed(17000, 5000)));
        assertEquals(5000, r.amountAsOf(TODAY));
    }

    @Test
    void exclusiveDoesNotRaiseTheLedgerAmount() {
        // 올리지는 않는다 — 품절·멤버십 조건이 구간에 안 실려 있어
        // 구간만 보고 올리면 일반 사용자가 못 받는 금액이 뜰 수 있다.
        OfferRecord r = record(4000, "exclusive", List.of(fixed(17000, 9000)));
        assertEquals(4000, r.amountAsOf(TODAY));
    }
}
