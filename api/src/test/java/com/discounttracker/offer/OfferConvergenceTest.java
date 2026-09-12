package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 배너 오퍼와 원장 오퍼가 겹치면 한쪽을 버리지 않고 사다리로 합친다.
 *
 * <p>2026-09-12 실측: 빽다방 배민 카드에 배짱할인 핫딜 7,000원만 남고 원장의
 * 상시 브랜드쿠폰 3,000원(15,000원↑)이 사라졌다. 둘 다 실제로 받을 수 있는
 * 쿠폰인데 화면에는 하나만 있었다 — preferredOver가 승자만 남기고, 상세 병합은
 * 금액이 같을 때만 돌기 때문이었다.
 */
class OfferConvergenceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 12);

    private static OfferRecord ledger(int amount, Integer minOrder, String capturedAt) {
        return new OfferRecord("baemin", "빽다방", amount, null, false,
                "discount", null, amount + "원", capturedAt, "x.jpg",
                minOrder, null, null, null, null, null, null, null, false);
    }

    private static OfferRecord banner(int amount, Integer minOrder, String capturedAt) {
        return new OfferRecord("baemin", "빽다방", amount, "행사", false,
                Offer.BANNER_OFFER_TYPE, null, amount + "원", capturedAt, null,
                minOrder, null, null, null, null, null, "https://link", null, false);
    }

    @Test
    void bannerAndLedgerConvergeIntoALadder() {
        Offer fromBanner = Offer.from(banner(7000, 15000, "2026-09-12T00:00:00+09:00"), TODAY);
        Offer fromLedger = Offer.from(ledger(3000, 15000, "2026-09-11T00:00:00+09:00"), TODAY);

        Offer merged = fromBanner.preferredOver(fromLedger);

        assertEquals(7000, merged.amount(), "대표 금액은 이긴 쪽 그대로다");
        assertEquals("exclusive", merged.tierMode(), "한 주문에 쿠폰 한 장이라 택일이다");
        assertNotNull(merged.tiers());
        assertEquals(List.of(7000, 3000),
                merged.tiers().stream().map(DiscountTier::amount).toList(),
                "원장 쿠폰이 사라지면 안 된다");
    }

    @Test
    void ledgerOnlyDuplicatesAreStillDeduped() {
        // 원장끼리 겹친 것은 같은 쿠폰의 중복이거나 정정이다. 사다리로 붙이면
        // 없던 선택지를 지어내게 된다(ADR-016).
        Offer newer = Offer.from(ledger(4000, 18000, "2026-09-12T00:00:00+09:00"), TODAY);
        Offer older = Offer.from(ledger(3000, 18000, "2026-09-11T00:00:00+09:00"), TODAY);

        Offer merged = newer.preferredOver(older);

        assertEquals(4000, merged.amount());
        assertNull(merged.tiers(), "원장끼리는 사다리를 만들지 않는다");
    }

    @Test
    void sameAmountStillMergesDetailOnly() {
        Offer fromBanner = Offer.from(banner(7000, null, "2026-09-12T00:00:00+09:00"), TODAY);
        Offer fromLedger = Offer.from(ledger(7000, 15000, "2026-09-11T00:00:00+09:00"), TODAY);

        Offer merged = fromBanner.preferredOver(fromLedger);

        assertNull(merged.tiers(), "같은 쿠폰이다 — 사다리가 아니라 상세 병합이다");
        assertEquals(15000, merged.minOrderAmount(), "최소주문은 진 쪽에서 끌어온다");
    }

    private static OfferRecord ledgerWithTiers(String tierMode, List<DiscountTier> tiers) {
        return new OfferRecord("baemin", "빽다방", 5000, null, false,
                "discount", null, "5,000원", "2026-09-11T00:00:00+09:00", "x.jpg",
                15000, tierMode, tiers, null, null, null, null, null, false);
    }

    @Test
    void anExclusiveLadderKeepsAllItsRungs() {
        // 진 쪽이 이미 택일 사다리면 그 단을 다 살린다 - 하나만 남기면
        // 원래 문제(진 쪽이 사라진다)가 그대로다.
        Offer fromBanner = Offer.from(banner(7000, 15000, "2026-09-12T00:00:00+09:00"), TODAY);
        Offer fromLedger = Offer.from(ledgerWithTiers("exclusive", List.of(
                new DiscountTier(15000, 5000, null, null, null, null, null),
                new DiscountTier(25000, 3000, null, null, null, null, null))), TODAY);

        Offer merged = fromBanner.preferredOver(fromLedger);

        assertEquals(List.of(7000, 5000, 3000),
                merged.tiers().stream().map(DiscountTier::amount).toList());
    }

    @Test
    void aCumulativeLadderIsNotMixedWith() {
        // cumulative는 쿠폰을 포개 쓴다는 뜻이라, 택일인 배너 쿠폰을 끼워
        // 넣으면 받을 수 없는 조합을 만든다(ADR-019).
        Offer fromBanner = Offer.from(banner(7000, 15000, "2026-09-12T00:00:00+09:00"), TODAY);
        Offer fromLedger = Offer.from(ledgerWithTiers("cumulative", List.of(
                new DiscountTier(15000, 5000, null, null, null, null, null))), TODAY);

        Offer merged = fromBanner.preferredOver(fromLedger);

        assertNull(merged.tiers(), "겹쳐 쓰는 사다리에는 섞지 않는다");
    }

    @Test
    void bannerProseNeverBecomesATierNote() {
        // 한때 배너 conditions를 그 구간 note로 내렸다가 되돌렸다
        // (2026-09-12). Banner.displayConditions()는 "extra에서 최소주문
        // 언급만 뺀 값"이라, 여러 브랜드를 나열한 배너에서는 브랜드 목록이
        // 그대로 딸려 온다. 라이브에 이런 것들이 나갔다:
        //
        //     푸라닭 5,000원   note="푸라닭·던킨"
        //     빽다방 1,900원   note="(배달 한정)/(픽업 한정)"
        //
        // 구간별 조건은 산문이 아니라 구조화된 값에서 와야 한다 — 쿠폰함이
        // 쿠폰마다 주는 badge가 그것이다(build_couponbox_records).
        OfferRecord bannerRec = new OfferRecord("baemin", "피자헛", 10000, "행사", false,
                Offer.BANNER_OFFER_TYPE, null, "10,000원", "2026-09-12T00:00:00+09:00", null,
                24000, null, null, "푸라닭·던킨", null, null, "https://link", null, false);
        OfferRecord ledgerRec = new OfferRecord("baemin", "피자헛", 7000, null, false,
                "discount", null, "7,000원", "2026-09-11T00:00:00+09:00", "x.jpg",
                22000, null, null, null, null, null, null, null, false);

        Offer merged = Offer.from(bannerRec, TODAY).preferredOver(Offer.from(ledgerRec, TODAY));

        for (DiscountTier tier : merged.tiers()) {
            assertNull(tier.note(), "배너 산문은 구간 조건이 아니다");
        }
    }
}
