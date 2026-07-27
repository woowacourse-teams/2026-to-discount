package com.discounttracker.service;

import com.discounttracker.alias.AliasResolver;
import com.discounttracker.data.ExportDataLoader;
import com.discounttracker.model.BrandComparison;
import com.discounttracker.model.Offer;
import com.discounttracker.model.OfferRecord;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BrandComparisonServiceTest {

    // ExportDataLoader를 상속 없이 대체하기 위해 레코드를 직접 넘기는 테스트 전용 로더.
    private ExportDataLoader loaderWith(List<OfferRecord> records) {
        return new ExportDataLoader(null) {
            @Override public void reload() { }
            @Override public List<OfferRecord> records() { return records; }
        };
    }

    private AliasResolver aliasWith(String yaml) {
        return new AliasResolver(new org.springframework.core.io.ByteArrayResource(
                yaml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    private OfferRecord rec(String platform, String brand, Integer amount,
                            String qualifier, boolean needsReview) {
        return new OfferRecord(platform, brand, amount, qualifier, needsReview,
                "discount", null, amount == null ? "" : amount + "원",
                "2026-07-27T14:20:00+09:00", "path.jpg");
    }

    @Test
    void groupsAliasesUnderCanonicalName() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("coupangeats", "멕시카나", 5000, null, false),
                        rec("yogiyo", "멕시카나치킨", 7000, "최대", true))),
                aliasWith("멕시카나:\n  - 멕시카나\n  - 멕시카나치킨\n"));
        List<BrandComparison> result = svc.compare();
        assertEquals(1, result.size());
        assertEquals("멕시카나", result.get(0).name());
        assertEquals(2, result.get(0).offers().size());
    }

    @Test
    void statusConfirmedWhenAmountPresentAndNotReview() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("baemin", "피자헛", 10000, null, false),
                        rec("yogiyo", "피자헛", 7000, "최대", true))),
                aliasWith(""));
        Offer baemin = svc.compare().get(0).offers().stream()
                .filter(o -> o.platform().equals("baemin")).findFirst().orElseThrow();
        Offer yogiyo = svc.compare().get(0).offers().stream()
                .filter(o -> o.platform().equals("yogiyo")).findFirst().orElseThrow();
        assertEquals("confirmed", baemin.status());
        assertEquals("held", yogiyo.status());
    }

    @Test
    void maxConfirmedAmountIgnoresHeld() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("baemin", "피자헛", 10000, null, false),
                        rec("yogiyo", "피자헛", 99000, "최대", true))),  // held는 커도 무시
                aliasWith(""));
        assertEquals(10000, svc.compare().get(0).maxConfirmedAmount());
    }

    @Test
    void sortsByMaxConfirmedDescending_confirmedlessGoLast() {
        var svc = new BrandComparisonService(
                loaderWith(List.of(
                        rec("baemin", "A브랜드", 4000, null, false),
                        rec("baemin", "B브랜드", 9000, null, false),
                        rec("yogiyo", "C브랜드", 8000, "최대", true))),  // 확정 없음
                aliasWith(""));
        List<BrandComparison> result = svc.compare();
        assertEquals("B브랜드", result.get(0).name());   // 9000 확정
        assertEquals("A브랜드", result.get(1).name());   // 4000 확정
        assertEquals("C브랜드", result.get(2).name());   // 확정 없음 → 맨 아래
        assertNull(result.get(2).maxConfirmedAmount());
    }
}
