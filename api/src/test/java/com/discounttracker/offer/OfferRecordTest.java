package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OfferRecordTest {

    private static final LocalDate TODAY = LocalDate.parse("2026-08-13");

    private OfferRecord record(Integer amount, String tierMode, List<DiscountTier> tiers) {
        return OfferRecord.builder("yogiyo", "굽네치킨")
                .amount(amount)
                .qualifier("최소")
                .offerType("discount")
                .rawText("최소 4,000원")
                .capturedAt("2026-07-31T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .tierMode(tierMode)
                .tiers(tiers)
                .soldOut(false)
                .build();
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
        OfferRecord r = OfferRecord.builder("yogiyo", "굽네치킨")
                .amount(4000)
                .qualifier("최소")
                .offerType("discount")
                .rawText("최소 4,000원")
                .capturedAt("2026-07-31T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .tierMode("cumulative")
                .tiers(List.of( new DiscountTier(17000, 4000, null, null, null, null, "2026-08-01"), new DiscountTier(25000, 1250, 5, 3000, null, null, null)))
                .soldOut(false)
                .build();
        assertEquals(1250, r.amountAsOf(TODAY));
    }

    @Test
    void cumulativeSkipsSoldOutTiers() {
        // 품절 구간은 못 받는 금액이라 더하면 안 된다. liveTiers는 만료만
        // 거르므로(상세 패널이 품절 구간도 보여줘야 한다) 합산 전에 한 번 더
        // 거른다 — 쿠팡이츠 메가MGC커피 실측과 같은 이유.
        OfferRecord r = OfferRecord.builder("yogiyo", "굽네치킨")
                .amount(4000)
                .qualifier("최소")
                .offerType("discount")
                .rawText("최소 4,000원")
                .capturedAt("2026-07-31T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .tierMode("cumulative")
                .tiers(List.of( new DiscountTier(17000, 4000, null, null, null, null, null), new DiscountTier(17000, 9999, null, null, null, true, null)))
                .soldOut(false)
                .build();
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
    void yogiyoPercentDeliveryAndTakeoutTotalsAreExclusiveChoices() {
        // tracker RULE-AUDIT-2026-10-08 7번(미친피자 2026-10-04): 기본 7,000 + 배달 정률(5%, 최대 3,000)
        // + 포장 2,000을 채널별 합계 구간으로 싣는다. 택일이라 더하지 않고 큰 쪽(포장 9,000)이 대표다.
        OfferRecord r = record(9000, "exclusive", List.of(
                fixed(19000, 7000),
                new DiscountTier(25000, 8250, 5, 10000, "배달", null, "2026-10-04", null),
                new DiscountTier(20000, 9000, null, null, "포장", null, "2026-10-04", null)));
        assertFalse(r.isCumulative());
        assertEquals(9000, r.amountAsOf(LocalDate.parse("2026-10-04")));
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
        OfferRecord r = OfferRecord.builder("baemin", "던킨")
                .amount(3000)
                .offerType("discount")
                .rawText("3,000원")
                .capturedAt("2026-09-14T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .minOrderAmount(15000)
                .tierMode("exclusive")
                .tiers(tiers)
                .membership("baeminClub")
                .soldOut(false)
                .build();
        assertEquals(Membership.NONE, r.membershipTier());
        // 구간이 전부 클럽이면 클럽.
        OfferRecord club = OfferRecord.builder("baemin", "던킨")
                .amount(8000)
                .offerType("discount")
                .rawText("8,000원")
                .capturedAt("2026-09-14T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .minOrderAmount(15000)
                .tierMode("exclusive")
                .tiers(List.of(tiers.get(0)))
                .soldOut(false)
                .build();
        assertEquals(Membership.BAEMIN_CLUB, club.membershipTier());
        // 구간에 값이 없으면 레코드 값.
        OfferRecord plain = OfferRecord.builder("baemin", "던킨")
                .amount(8000)
                .offerType("discount")
                .rawText("8,000원")
                .capturedAt("2026-09-14T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .minOrderAmount(15000)
                .tierMode("exclusive")
                .tiers(List.of(new DiscountTier(15000, 8000, null, null, null, null, null)))
                .membership("baeminClub")
                .soldOut(false)
                .build();
        assertEquals(Membership.BAEMIN_CLUB, plain.membershipTier());
    }

    @Test
    void unknownMembershipIsFilledFromTheLosingRecord() {
        // 허브 재캡처(최신, 표시 없음)가 이기고 쿠폰함(옛것, 와우 관측)이
        // 진다. 2026-09-14: 이 병합이 없으면 다음 허브 갱신 때 와우 전용
        // 12곳이 일반 쿠폰으로 선다.
        Offer hub = Offer.from(OfferRecord.builder("coupangeats", "BBQ")
                .amount(5000)
                .offerType("discount")
                .rawText("5,000원할인")
                .capturedAt("2026-09-15T07:00:00+09:00")
                .screenshotPath("x.png")
                .soldOut(false)
                .build(), java.time.LocalDate.parse("2026-09-15"));
        Offer box = Offer.from(OfferRecord.builder("coupangeats", "BBQ")
                .amount(5000)
                .offerType("discount")
                .rawText("5,000원할인")
                .capturedAt("2026-09-13T11:05:00+09:00")
                .screenshotPath("y.png")
                .minOrderAmount(15000)
                .membership("coupangEats")
                .soldOut(false)
                .build(), java.time.LocalDate.parse("2026-09-15"));
        assertEquals(Membership.COUPANG_EATS, hub.preferredOver(box).membership());
        // 관측된 "none"은 안 덮인다 — 봤는데 없더라는 사실이다.
        Offer boxNone = Offer.from(OfferRecord.builder("coupangeats", "BBQ")
                .amount(5000)
                .offerType("discount")
                .rawText("5,000원할인")
                .capturedAt("2026-09-15T11:05:00+09:00")
                .screenshotPath("z.png")
                .minOrderAmount(15000)
                .membership("none")
                .soldOut(false)
                .build(), java.time.LocalDate.parse("2026-09-15"));
        assertEquals(Membership.NONE, boxNone.preferredOver(box).membership());
    }

    @Test
    void keepsKnownMembership() {
        OfferRecord r = OfferRecord.builder("baemin", "던킨")
                .amount(4000)
                .offerType("discount")
                .rawText("4,000원 메뉴할인")
                .capturedAt("2026-08-31T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .minOrderAmount(18000)
                .badge("배민클럽")
                .membership("baeminClub")
                .soldOut(false)
                .build();
        assertEquals(Membership.BAEMIN_CLUB, r.membershipTier());
    }

    @Test
    void unrecognizedMembershipValueNormalizesToUnknown() {
        // 판독 오류로 이상한 값이 들어와도 안 죽고 "모름"으로 본다.
        OfferRecord r = OfferRecord.builder("baemin", "던킨")
                .amount(4000)
                .offerType("discount")
                .rawText("4,000원")
                .capturedAt("2026-08-31T10:00:00+09:00")
                .screenshotPath("x.jpg")
                .membership("premium")
                .soldOut(false)
                .build();
        assertEquals(Membership.UNKNOWN, r.membershipTier());
    }

    @Test
    void firstSeenAtPassesThroughFromExportJsonToOffer() throws Exception {
        String json = """
                {"platform":"baemin","brand":"BBQ","amount":3000,"needsReview":false,
                 "rawText":"3,000원","capturedAt":"2026-10-04T08:48:11+09:00",
                 "firstSeenAt":"2026-10-03T00:37:00+09:00","someFutureField":1}""";
        OfferRecord r = tools.jackson.databind.json.JsonMapper.builderWithJackson2Defaults()
                .disable(tools.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()
                .readValue(json, OfferRecord.class);
        assertEquals("2026-10-03T00:37:00+09:00", r.firstSeenAt());
        assertEquals("2026-10-03T00:37:00+09:00", Offer.from(r, LocalDate.of(2026, 10, 4)).firstSeenAt());
    }

    private static Offer readQualifiers(String field) throws Exception {
        String json = "{\"platform\":\"coupangeats\",\"brand\":\"CU\",\"amount\":3000,\"needsReview\":false,"
                + "\"capturedAt\":\"2026-10-22T10:00:00+09:00\"" + field + "}";
        OfferRecord r = tools.jackson.databind.json.JsonMapper.builderWithJackson2Defaults()
                .disable(tools.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()
                .readValue(json, OfferRecord.class);
        return Offer.from(r, TODAY);
    }

    @Test
    void qualifiersPassThroughFromExportJsonToOffer() throws Exception {
        // 키 없음과 null은 모름, []는 "조건 없음"을 본 것이라 서로 바꾸지 않는다(#155, ADR-003).
        assertNull(readQualifiers("").qualifiers());
        assertNull(readQualifiers(",\"qualifiers\":null").qualifiers());
        assertEquals(List.of(), readQualifiers(",\"qualifiers\":[]").qualifiers());
        assertEquals(List.of("첫 주문"), readQualifiers(",\"qualifiers\":[\"첫 주문\"]").qualifiers());
    }

    @Test
    void qualifiersAsBareStringFailsTheRead() {
        // 문자열 하나를 배열로 고쳐 읽지 않는다. 모양이 틀린 원장은 reload가 크게 실패한다(#155 열린 질문 1, ADR-012).
        assertThrows(tools.jackson.core.JacksonException.class, () -> readQualifiers(",\"qualifiers\":\"첫 주문\""));
    }

    private static Offer withQualifiers(Integer amount, String capturedAt, List<String> qualifiers) {
        return Offer.from(OfferRecord.builder("coupangeats", "CU").amount(amount).capturedAt(capturedAt)
                .qualifiers(qualifiers).build(), TODAY);
    }

    @Test
    void duplicateTakesLoserQualifiersOnlyWhenWinnerHasNone() {
        String newer = "2026-08-13T10:00:00+09:00";
        String older = "2026-08-12T10:00:00+09:00";
        assertEquals(List.of("첫 주문"),
                withQualifiers(3000, newer, null).preferredOver(withQualifiers(3000, older, List.of("첫 주문"))).qualifiers());
        assertEquals(List.of("첫 주문"),
                withQualifiers(3000, newer, List.of("첫 주문")).preferredOver(withQualifiers(3000, older, List.of("다른 값"))).qualifiers());
        assertEquals(List.of(),
                withQualifiers(3000, newer, List.of()).preferredOver(withQualifiers(3000, older, List.of("첫 주문"))).qualifiers());
        // 금액이 다르면 다른 쿠폰이라 안 섞는다(sameCoupon).
        assertNull(withQualifiers(3000, newer, null).preferredOver(withQualifiers(5000, older, List.of("첫 주문"))).qualifiers());
    }

    @Test
    void qualifiersSurviveOtherTransforms() {
        Offer o = withQualifiers(3000, "2026-08-13T10:00:00+09:00", List.of("첫 주문"));
        assertEquals(List.of("첫 주문"), o.withIsNew(true).qualifiers());
        // 선착순을 구간으로 붙여도 오퍼의 조건은 상시 것이다(#155 열린 질문 2).
        Offer first = withQualifiers(5000, "2026-08-13T10:00:00+09:00", List.of("다른 값"));
        assertEquals(List.of("첫 주문"), o.withFirstComeTier(first).qualifiers());
    }

    private static Offer withLink(int amount, String link, String offerType) {
        return Offer.from(OfferRecord.builder("baemin", "bhc").amount(amount).offerType(offerType)
                .rawText(amount + "원").capturedAt("2026-08-13T10:00:00+09:00").minOrderAmount(15000)
                .link(link).soldOut(false).build(), LocalDate.of(2026, 8, 13));
    }

    private static void assertPaired(Offer o) {
        assertEquals(o.link() == null, o.linkSource() == LinkSource.NONE, o.toString());
    }

    @Test
    void linkSourceFollowsTheLinkAndTheOfferType() {
        assertEquals(LinkSource.NONE, withLink(3000, null, "discount").linkSource());
        assertEquals(LinkSource.RECORD, withLink(3000, "https://own", "discount").linkSource());
        assertEquals(LinkSource.BANNER, withLink(3000, "https://own", Offer.BANNER_OFFER_TYPE).linkSource());
        assertEquals(LinkSource.BANNER, withLink(3000, "https://own", Offer.BANNER_FIRST_COME_OFFER_TYPE).linkSource());
        assertEquals(LinkSource.NONE, withLink(3000, null, Offer.BANNER_OFFER_TYPE).linkSource(), "링크 없는 배너 오퍼");
    }

    @Test
    void linkSourceSurvivesTransformsAndStaysPairedWithTheLink() {
        Offer regular = withLink(3000, null, "discount");
        Offer withOwn = withLink(3000, "https://own", "discount");
        assertEquals(LinkSource.ADDED, regular.withFilterLink("https://hub").linkSource());
        assertEquals(LinkSource.RECORD, withOwn.withIsNew(true).linkSource());
        assertEquals(LinkSource.ADDED, regular.withFilterLink("https://hub").withIsNew(true).linkSource());
        // 병합은 이긴 쪽의 링크와 출처를 그대로 둔다.
        Offer won = withOwn.preferredOver(withLink(3000, null, "discount"));
        assertEquals(LinkSource.RECORD, won.linkSource());
        assertPaired(won);
        assertPaired(regular.preferredOver(withLink(3000, "https://other", "discount")));

        // 선착순을 구간으로 붙일 때 link는 대표 쪽에서 오므로 출처도 대표 쪽에서 와야 한다.
        Offer firstLeads = withOwn.withFirstComeTier(withLink(5000, null, "discount").withFilterLink("https://hub"));
        assertEquals("https://hub", firstLeads.link());
        assertEquals(LinkSource.ADDED, firstLeads.linkSource());
        Offer regularLeads = withOwn.withFirstComeTier(withLink(1000, "https://first", "discount"));
        assertEquals("https://own", regularLeads.link());
        assertEquals(LinkSource.RECORD, regularLeads.linkSource());
        Offer noLinkLeads = regular.withFirstComeTier(withLink(5000, "https://first", "discount"));
        assertEquals("https://first", noLinkLeads.link());
        assertEquals(LinkSource.RECORD, noLinkLeads.linkSource());
        for (Offer o : new Offer[] {firstLeads, regularLeads, noLinkLeads, regular.withFirstComeTier(withLink(1000, null, "discount"))}) {
            assertPaired(o);
        }
    }
}