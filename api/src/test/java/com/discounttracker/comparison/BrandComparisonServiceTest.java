package com.discounttracker.comparison;

import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.brand.Category;
import com.discounttracker.offer.DiscountTier;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import com.discounttracker.offer.OfferStatus;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BrandComparisonServiceTest {

    /** 파일을 거치지 않고 레코드를 바로 넘기는 테스트용 저장소. */
    private OfferRepository repositoryWith(List<OfferRecord> records) {
        return new OfferRepository(null) {
            @Override public void reload() { }
            @Override public List<OfferRecord> findAll() { return records; }
        };
    }

    private BrandCatalog catalogWith(String yaml) {
        return new BrandCatalog(new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)));
    }

    private BrandComparisonService serviceWith(List<OfferRecord> records, String yaml) {
        return new BrandComparisonService(repositoryWith(records), catalogWith(yaml));
    }

    private OfferRecord rec(String platform, String brand, Integer amount,
                            String qualifier, boolean needsReview) {
        return new OfferRecord(platform, brand, amount, qualifier, needsReview,
                "discount", null, amount == null ? "" : amount + "원",
                "2026-07-27T14:20:00+09:00", "path.jpg", null, null, null);
    }

    @Test
    void groupsAliasesUnderCanonicalName() {
        var svc = serviceWith(
                List.of(rec("coupangeats", "멕시카나", 5000, null, false),
                        rec("yogiyo", "멕시카나치킨", 7000, "최대", true)),
                "brands:\n  멕시카나:\n    aliases: [멕시카나치킨]\n");
        List<BrandComparison> result = svc.compare();
        assertEquals(1, result.size());
        assertEquals("멕시카나", result.get(0).name());
        assertEquals(2, result.get(0).offers().size());
    }

    @Test
    void statusConfirmedWhenAmountPresentAndNotReview() {
        var result = serviceWith(
                List.of(rec("baemin", "피자헛", 10000, null, false),
                        rec("yogiyo", "피자헛", 7000, "최대", true)),
                "brands: {}").compare();
        List<Offer> offers = result.get(0).offers();
        assertEquals(OfferStatus.CONFIRMED, offers.stream()
                .filter(o -> o.platform().equals("baemin")).findFirst().orElseThrow().status());
        assertEquals(OfferStatus.HELD, offers.stream()
                .filter(o -> o.platform().equals("yogiyo")).findFirst().orElseThrow().status());
    }

    @Test
    void serializesStatusAsLowercaseKey() {
        // 프론트가 "confirmed"/"held" 문자열을 그대로 쓰므로 enum 도입 후에도 유지돼야 한다.
        var result = serviceWith(
                List.of(rec("baemin", "피자헛", 10000, null, false)), "brands: {}").compare();
        assertEquals("confirmed", result.get(0).offers().get(0).statusKey());
    }

    @Test
    void maxConfirmedAmountIgnoresHeld() {
        var result = serviceWith(
                List.of(rec("baemin", "피자헛", 10000, null, false),
                        rec("yogiyo", "피자헛", 99000, "최대", true)),
                "brands: {}").compare();
        assertEquals(10000, result.get(0).maxConfirmedAmount());
    }

    @Test
    void sortsByMaxConfirmedDescending_confirmedlessGoLast() {
        var result = serviceWith(
                List.of(rec("baemin", "A브랜드", 4000, null, false),
                        rec("baemin", "B브랜드", 9000, null, false),
                        rec("yogiyo", "C브랜드", 8000, "최대", true)),
                "brands: {}").compare();
        assertEquals("B브랜드", result.get(0).name());
        assertEquals("A브랜드", result.get(1).name());
        assertEquals("C브랜드", result.get(2).name());
        assertNull(result.get(2).maxConfirmedAmount());
    }

    @Test
    void confirmedlessBrandsSortByHeldAmountDescending() {
        // held 작은 쪽을 먼저 넣어, 삽입 순서가 아니라 금액으로 정렬되는지 본다.
        var result = serviceWith(
                List.of(rec("baemin", "확정브랜드", 5000, null, false),
                        rec("yogiyo", "held3000", 3000, "최대", true),
                        rec("yogiyo", "held8000", 8000, "최대", true)),
                "brands: {}").compare();
        assertEquals("확정브랜드", result.get(0).name());
        assertEquals("held8000", result.get(1).name());
        assertEquals("held3000", result.get(2).name());
    }

    @Test
    void dedupesSamePlatformOffersKeepingConfirmedThenLargerAmount() {
        var result = serviceWith(
                List.of(rec("baemin", "빽보이피자", 6000, null, false),
                        rec("baemin", "빽보이피자", 4000, null, false)),
                "brands: {}").compare();
        assertEquals(1, result.size());
        List<Offer> baemin = result.get(0).offers().stream()
                .filter(o -> o.platform().equals("baemin")).toList();
        assertEquals(1, baemin.size());
        assertEquals(6000, baemin.get(0).amount());
    }

    @Test
    void dedupePrefersConfirmedOverLargerHeld() {
        var result = serviceWith(
                List.of(rec("baemin", "브랜드", 99000, "최대", true),
                        rec("baemin", "브랜드", 3000, null, false)),
                "brands: {}").compare();
        List<Offer> offers = result.get(0).offers();
        assertEquals(1, offers.size());
        assertEquals(3000, offers.get(0).amount());
        assertEquals(OfferStatus.CONFIRMED, offers.get(0).status());
    }

    @Test
    void carriesDetailFieldsThroughToOffer() {
        // 상세 패널이 읽는 값 — 서비스는 해석하지 않고 그대로 흘려보낸다.
        OfferRecord detailed = new OfferRecord("yogiyo", "굽네치킨", 7000, "최대", true,
                "discount", null, "최대 7,000원 할인", "2026-07-27T14:25:00+09:00",
                "x.jpg", 15000, List.of(new DiscountTier(15000, 3000)), "1일 1회");
        Offer offer = serviceWith(List.of(detailed), "brands: {}")
                .compare().get(0).offers().get(0);
        assertEquals(15000, offer.minOrderAmount());
        assertEquals("1일 1회", offer.conditions());
        assertEquals(3000, offer.tiers().get(0).amount());
        assertEquals("2026-07-27T14:25:00+09:00", offer.capturedAt());
    }

    @Test
    void exposesCategoryAndLinkFromCatalog() {
        var result = serviceWith(
                List.of(rec("ddangyo", "BBQ", 4000, "최대", false)),
                """
                brands:
                  BBQ:
                    category: chicken
                    link: https://example.test/bbq
                """).compare();
        assertEquals(Category.CHICKEN, result.get(0).brand().category());
        assertEquals("chicken", result.get(0).categoryKey());
        assertEquals("https://example.test/bbq", result.get(0).link());
    }

    @Test
    void brandMissingFromCatalogHasNullCategoryAndLink() {
        // brands.yml에 아직 안 넣은 브랜드도 화면에는 떠야 한다(카테고리만 비어 있음).
        var result = serviceWith(
                List.of(rec("baemin", "신규브랜드", 5000, null, false)), "brands: {}").compare();
        assertEquals("신규브랜드", result.get(0).name());
        assertNull(result.get(0).categoryKey());
        assertNull(result.get(0).link());
    }
}
