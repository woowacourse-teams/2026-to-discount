package com.discounttracker.comparison;

import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 원장의 낱개 레코드를 브랜드 단위 비교 결과로 묶는다.
 *
 * <p>하는 일은 세 가지뿐이다: 별칭으로 같은 브랜드 묶기, 같은 앱에 중복
 * 잡힌 오퍼 정리하기, 할인 큰 순으로 줄 세우기. 판정 규칙 자체는
 * {@link Offer}와 {@link BrandComparison}이 들고 있다.
 */
@Service
public class BrandComparisonService {

    private final OfferRepository offers;
    private final BrandCatalog brands;

    public BrandComparisonService(OfferRepository offers, BrandCatalog brands) {
        this.offers = offers;
        this.brands = brands;
    }

    public List<BrandComparison> compare() {
        // 삽입 순서를 유지해야 같은 입력에 항상 같은 순서가 나온다(동점일 때).
        Map<String, Map<String, Offer>> byBrand = new LinkedHashMap<>();
        Map<String, Integer> maxConfirmed = new LinkedHashMap<>();
        Map<String, Integer> maxHeld = new LinkedHashMap<>();

        for (OfferRecord record : offers.findAll()) {
            String name = brands.canonical(record.brand());
            Offer offer = Offer.from(record);

            byBrand.computeIfAbsent(name, k -> new LinkedHashMap<>())
                    .merge(record.platform(), offer, Offer::preferredOver);

            if (record.amount() != null) {
                Map<String, Integer> target =
                        record.status().isConfirmed() ? maxConfirmed : maxHeld;
                target.merge(name, record.amount(), Math::max);
            }
        }

        List<BrandComparison> result = new ArrayList<>();
        byBrand.forEach((name, offersByPlatform) -> result.add(new BrandComparison(
                brands.find(name),
                maxConfirmed.get(name),
                maxHeld.get(name),
                new ArrayList<>(offersByPlatform.values()))));

        result.sort(BrandComparison.byBestDiscount());
        return result;
    }
}
