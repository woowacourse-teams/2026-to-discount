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
                "x.jpg", null, tierMode, tiers, null, null, null, null, null, false);
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
                null, null, null, null, null, false);
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
                null, null, null, null, null, false);
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

    @Test
    void missingMembershipIsUnknownNotNone() {
        // 필드가 없으면 "그 화면에선 안 보였다"다 — 허브 카드·브랜드관엔
        // 멤버십 표시가 없다. "none"은 쿠폰함에서 본 관측이라 따로 간다.
        // 둘 다 JSON으로는 "none"이라 화면은 배지를 안 그린다.
        assertEquals(Membership.UNKNOWN, record(4000, null, null).membershipTier());
        assertEquals("none", Membership.UNKNOWN.key());
        assertEquals(Membership.NONE, Membership.from("none"));
    }

    @Test
    void membershipIsDerivedFromTheLeastRestrictiveTier() {
        // "8,000원 배민클럽"과 "3,000원 누구나"가 한 오퍼에 구간 둘로 산다.
        // 카드 배지·정렬이 보는 오퍼 값은 누구나(NONE)다(ADR-029).
        List<DiscountTier> tiers = List.of(
                new DiscountTier(15000, 8000, null, null, null, null, null, null, "baeminClub"),
                new DiscountTier(15000, 3000, null, null, null, null, null, null, "none"));
        OfferRecord r = new OfferRecord("baemin", "던킨", 3000, null, false,
                "discount", null, "3,000원", "2026-09-14T10:00:00+09:00",
                "x.jpg", 15000, "exclusive", tiers, null, null, null, null, "baeminClub", false);
        assertEquals(Membership.NONE, r.membershipTier());
        // 구간이 전부 클럽이면 클럽.
        OfferRecord club = new OfferRecord("baemin", "던킨", 8000, null, false,
                "discount", null, "8,000원", "2026-09-14T10:00:00+09:00",
                "x.jpg", 15000, "exclusive", List.of(tiers.get(0)), null, null, null, null, null, false);
        assertEquals(Membership.BAEMIN_CLUB, club.membershipTier());
        // 구간에 값이 없으면 레코드 값.
        OfferRecord plain = new OfferRecord("baemin", "던킨", 8000, null, false,
                "discount", null, "8,000원", "2026-09-14T10:00:00+09:00",
                "x.jpg", 15000, "exclusive",
                List.of(new DiscountTier(15000, 8000, null, null, null, null, null)),
                null, null, null, null, "baeminClub", false);
        assertEquals(Membership.BAEMIN_CLUB, plain.membershipTier());
    }

    @Test
    void unknownMembershipIsFilledFromTheLosingRecord() {
        // 허브 재캡처(최신, 표시 없음)가 이기고 쿠폰함(옛것, 와우 관측)이
        // 진다. 2026-09-14: 이 병합이 없으면 다음 허브 갱신 때 와우 전용
        // 12곳이 일반 쿠폰으로 선다.
        Offer hub = Offer.from(new OfferRecord("coupangeats", "BBQ", 5000, null, false,
                "discount", null, "5,000원할인", "2026-09-15T07:00:00+09:00",
                "x.png", null, null, null, null, null, null, null, null, false), java.time.LocalDate.parse("2026-09-15"));
        Offer box = Offer.from(new OfferRecord("coupangeats", "BBQ", 5000, null, false,
                "discount", null, "5,000원할인", "2026-09-13T11:05:00+09:00",
                "y.png", 15000, null, null, null, null, null, null, "coupangEats", false), java.time.LocalDate.parse("2026-09-15"));
        assertEquals(Membership.COUPANG_EATS, hub.preferredOver(box).membership());
        // 관측된 "none"은 안 덮인다 — 봤는데 없더라는 사실이다.
        Offer boxNone = Offer.from(new OfferRecord("coupangeats", "BBQ", 5000, null, false,
                "discount", null, "5,000원할인", "2026-09-15T11:05:00+09:00",
                "z.png", 15000, null, null, null, null, null, null, "none", false), java.time.LocalDate.parse("2026-09-15"));
        assertEquals(Membership.NONE, boxNone.preferredOver(box).membership());
    }

    @Test
    void keepsKnownMembership() {
        OfferRecord r = new OfferRecord("baemin", "던킨", 4000, null, false,
                "discount", null, "4,000원 메뉴할인", "2026-08-31T10:00:00+09:00",
                "x.jpg", 18000, null, null, null, null, "배민클럽", null, "baeminClub", false);
        assertEquals(Membership.BAEMIN_CLUB, r.membershipTier());
    }

    @Test
    void unrecognizedMembershipValueNormalizesToUnknown() {
        // 판독 오류로 이상한 값이 들어와도 안 죽고 "모름"으로 본다.
        OfferRecord r = new OfferRecord("baemin", "던킨", 4000, null, false,
                "discount", null, "4,000원", "2026-08-31T10:00:00+09:00",
                "x.jpg", null, null, null, null, null, null, null, "premium", false);
        assertEquals(Membership.UNKNOWN, r.membershipTier());
    }
}
