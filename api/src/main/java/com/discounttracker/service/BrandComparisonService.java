package com.discounttracker.service;

import com.discounttracker.alias.AliasResolver;
import com.discounttracker.data.ExportDataLoader;
import com.discounttracker.model.BrandComparison;
import com.discounttracker.model.Offer;
import com.discounttracker.model.OfferRecord;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BrandComparisonService {

    private final ExportDataLoader loader;
    private final AliasResolver aliases;

    public BrandComparisonService(ExportDataLoader loader, AliasResolver aliases) {
        this.loader = loader;
        this.aliases = aliases;
    }

    private static boolean isConfirmed(OfferRecord r) {
        return r.amount() != null && !r.needsReview();
    }

    public List<BrandComparison> compare() {
        // 대표명별로 offer 모으기
        Map<String, List<Offer>> byBrand = new LinkedHashMap<>();
        Map<String, Integer> maxConfirmed = new LinkedHashMap<>();
        Map<String, Integer> maxHeld = new LinkedHashMap<>();  // 확정 없는 브랜드끼리의 정렬용

        for (OfferRecord r : loader.records()) {
            String name = aliases.canonical(r.brand());
            String status = isConfirmed(r) ? "confirmed" : "held";
            byBrand.computeIfAbsent(name, k -> new ArrayList<>())
                    .add(new Offer(r.platform(), r.amount(), r.qualifier(), status, r.rawText()));
            if (isConfirmed(r)) {
                maxConfirmed.merge(name, r.amount(), Math::max);
            } else if (r.amount() != null) {
                maxHeld.merge(name, r.amount(), Math::max);
            }
        }

        List<BrandComparison> result = new ArrayList<>();
        for (var entry : byBrand.entrySet()) {
            result.add(new BrandComparison(
                    entry.getKey(), maxConfirmed.get(entry.getKey()), entry.getValue()));
        }

        // 정렬: 확정값 있는 것 먼저(확정 큰 순), 확정 없는 것은 그 아래에서 held 큰 순.
        result.sort(Comparator
                .comparing((BrandComparison b) -> b.maxConfirmedAmount() == null)  // false(확정) 먼저
                .thenComparing(b -> b.maxConfirmedAmount() != null
                        ? -nullToZero(b.maxConfirmedAmount())
                        : -nullToZero(maxHeld.get(b.name()))));
        return result;
    }

    private static int nullToZero(Integer v) {
        return v == null ? 0 : v;
    }
}
