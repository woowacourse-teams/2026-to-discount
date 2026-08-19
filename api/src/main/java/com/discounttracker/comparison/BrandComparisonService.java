package com.discounttracker.comparison;

import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 원장의 낱개 레코드를 브랜드 단위 비교 결과로 묶는다.
 *
 * <p>하는 일은 네 가지뿐이다: 종료일이 지난 오퍼 걸러내기, 별칭으로 같은
 * 브랜드 묶기, 같은 앱에 중복 잡힌 오퍼 정리하기, 할인 큰 순으로 줄
 * 세우기. 판정 규칙 자체는 {@link OfferRecord}·{@link Offer}와
 * {@link BrandComparison}이 들고 있다.
 */
@Service
public class BrandComparisonService {

    private final OfferRepository offers;
    private final BrandCatalog brands;
    private final Clock clock;

    public BrandComparisonService(OfferRepository offers, BrandCatalog brands, Clock clock) {
        this.offers = offers;
        this.brands = brands;
        this.clock = clock;
    }

    public List<BrandComparison> compare() {
        return compare(offers.findAll());
    }

    /**
     * 원장 대신 넘겨받은 레코드로 비교한다 — 검수용 더미 데이터
     * ({@code /api/test})가 운영과 똑같은 판정 규칙을 타게 하려고 열어둔다.
     * 규칙을 따로 복사해두면 그 복사본이 먼저 낡는다.
     */
    public List<BrandComparison> compare(List<OfferRecord> records) {
        // 원장은 tracker가 push할 때만 바뀌지만 오늘 날짜는 계속 바뀐다.
        // 그래서 만료 판정은 적재 시점이 아니라 요청을 처리하는 지금 한다.
        LocalDate today = LocalDate.now(clock);

        // 삽입 순서를 유지해야 같은 입력에 항상 같은 순서가 나온다(동점일 때).
        Map<String, Map<String, Offer>> byBrand = new LinkedHashMap<>();
        Map<String, Integer> maxConfirmed = new LinkedHashMap<>();
        Map<String, Integer> maxHeld = new LinkedHashMap<>();

        for (OfferRecord record : records) {
            // 묶기·중복정리·대표금액 계산 어디에도 넣지 않는다. 정리한 뒤에
            // 빼면 만료된 오퍼가 승자로 뽑힌 다음 사라지면서, 같은 앱에서
            // 진 살아 있는 오퍼까지 함께 없앤다(ADR-008).
            if (record.isExpired(today)) {
                continue;
            }

            String name = brands.canonical(record.brand());
            Offer offer = Offer.from(record, today);

            byBrand.computeIfAbsent(name, k -> new LinkedHashMap<>())
                    .merge(record.platform(), offer, Offer::preferredOver);

            // 원장의 금액이 아니라 오늘 기준 금액을 쓴다 — 만료된 구간 때문에
            // 대표값이 내려갔으면 카드 대표 금액과 정렬도 같이 내려가야 한다.
            //
            // qualifier가 붙은 값은 maxConfirmed에 넣지 않는다. "최대"는
            // 최소주문금액을 채워야 나오는 상한액이라(화면 배지가 "불확정")
            // 액면 그대로 확정값과 견주면 그 브랜드가 실제보다 위로 올라간다
            // — 카드 정렬과 "최고 할인" 배지가 둘 다 거짓이 된다. 프론트가
            // 카드 안에서 쓰는 bestAmount는 이미 qualifier를 빼고 고르는데
            // 여기가 안 빼서 두 레이어가 다른 답을 내고 있었다(ADR-016).
            //
            // maxHeld는 그대로 둔다 — 확정이 하나도 없는 브랜드끼리만 줄
            // 세우는 내부값이고, 그 브랜드들은 이미 확정 있는 브랜드 전부
            // 아래에 깔린다. 여기서까지 빼면 정렬 근거가 없어져 삽입 순서로
            // 흩어진다.
            if (offer.amount() != null) {
                boolean confirmed = record.status().isConfirmed();
                if (confirmed && offer.qualifier() != null) {
                    continue;
                }
                Map<String, Integer> target = confirmed ? maxConfirmed : maxHeld;
                target.merge(name, offer.amount(), Math::max);
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
