package com.discounttracker.web;

import com.discounttracker.brand.Brand;
import com.discounttracker.comparison.BrandComparison;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.testdata.TestDataCatalog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 검수용 더미 데이터 엔드포인트. 운영 엔드포인트(/api/brands)는 손대지 않고,
 * 같은 판정 규칙(BrandComparisonService)에 다른 입력만 태운다.
 *
 * <p>일부러 심어둔 오류가 25% 섞여 있다 — 검수 도구·화면이 그걸 잡아내는지
 * 보는 게 목적이라, 여기 응답이 "깨끗한" 것은 오히려 실패 신호다.
 */
@RestController
@RequestMapping("/api/test")
public class TestDataController {

    private final BrandComparisonService service;
    private final TestDataCatalog testData;

    public TestDataController(BrandComparisonService service, TestDataCatalog testData) {
        this.service = service;
        this.testData = testData;
    }

    /** 운영의 /api/brands와 같은 모양. 링크 크랙만 이 단계에서 덮어씌운다. */
    @GetMapping("/brands")
    public List<BrandComparison> brands() {
        return service.compare(testData.records()).stream()
                .map(this::applyCrackedLink)
                .toList();
    }

    /**
     * 어떤 오류를 몇 건 심었는지. 검수 결과를 채점하려면 정답지가 필요하다 —
     * 사람이 세어보는 대신 여기서 바로 받아 비교한다.
     */
    @GetMapping("/faults")
    public Map<String, Object> faults() {
        List<TestDataCatalog.Fault> items = testData.faults();
        Map<String, Integer> byKind = new LinkedHashMap<>();
        items.forEach(f -> byKind.merge(f.kind(), 1, Integer::sum));

        int total = testData.records().size();
        return Map.of(
                "total", total,
                "faulty", items.size(),
                "faultRatePercent", total == 0 ? 0 : items.size() * 100 / total,
                "byKind", byKind,
                "items", items);
    }

    /**
     * 링크 크랙은 원장(export.json)이 아니라 brands.yml이 들고 있는 값이라
     * 더미 파일만으로는 재현되지 않는다 — 응답을 내보내기 직전에 해당
     * 브랜드의 링크만 잘못된 주소로 바꾼다.
     */
    private BrandComparison applyCrackedLink(BrandComparison comparison) {
        String broken = testData.crackedLink(comparison.name());
        if (broken == null) {
            return comparison;
        }
        Brand original = comparison.brand();
        Map<String, String> links = new HashMap<>(original.links());
        // 그 브랜드가 가진 앱 링크를 전부 깨뜨린다 — 하나만 깨면 화면에서
        // 다른 앱 링크로 우회돼 검수에 안 잡힌다.
        links.replaceAll((platform, url) -> broken);
        if (links.isEmpty()) {
            links.put(firstPlatform(comparison), broken);
        }
        return new BrandComparison(
                new Brand(original.name(), original.category(), links),
                comparison.maxConfirmedAmount(),
                comparison.maxHeldAmount(),
                comparison.offers());
    }

    private String firstPlatform(BrandComparison comparison) {
        return comparison.offers().isEmpty()
                ? "baemin" : comparison.offers().get(0).platform();
    }
}
