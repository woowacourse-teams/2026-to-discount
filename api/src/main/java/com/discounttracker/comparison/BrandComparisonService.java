package com.discounttracker.comparison;

import com.discounttracker.banner.Banner;
import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.DiscountTier;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    private final BannerCatalog banners;
    private final Clock clock;

    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock) {
        this.offers = offers;
        this.brands = brands;
        this.banners = banners;
        this.clock = clock;
    }

    public List<BrandComparison> compare() {
        // 배너는 사람이 그날 손으로 적는 행사다. 원장(캡처)에는 안 잡히지만
        // 실제로 받을 수 있는 할인이라, 배너에 올린 순간 그 브랜드 카드에도
        // 뜨고 기간이 지나면 알아서 빠져야 한다.
        //
        // 레코드로 바꿔 원장 앞에 붙이면 그 뒤 처리(별칭 묶기, 같은 앱 중복
        // 정리, 만료 판정, 정렬)를 전부 그대로 탄다 — 배너용 경로를 따로
        // 내면 그쪽이 먼저 낡는다.
        List<OfferRecord> withBanners = new ArrayList<>(bannerRecords());
        withBanners.addAll(offers.findAll());
        return compare(withBanners);
    }

    /** 배너 금액의 맨 앞 "n,nnn원". "최대 30%"처럼 정액이 아니면 안 걸린다. */
    private static final Pattern BANNER_AMOUNT = Pattern.compile("([0-9][0-9,]*)\s*원");

    /**
     * 오늘 띄우는 배너 중 오퍼로 세울 수 있는 것.
     *
     * <p>브랜드가 없는 배너(앱 전체 행사)는 붙을 카드가 없고, 금액이 정액이
     * 아닌 배너("최대 30%")는 다른 오퍼와 견줄 수가 없다. 둘 다 오퍼로는
     * 안 넣고 배너로만 둔다 — 억지로 넣으면 정렬과 최고 할인이 흔들린다.
     */
    private List<OfferRecord> bannerRecords() {
        String today = LocalDate.now(clock).toString();
        List<OfferRecord> records = new ArrayList<>();
        for (Banner banner : banners.active()) {
            if (banner.brand() == null) continue;
            Integer amount = amountOf(banner.amount());
            if (amount == null) continue;
            List<DiscountTier> compound = banner.compoundTiers();

            records.add(new OfferRecord(
                    banner.platform(),
                    banner.brand(),
                    amount,
                    // 쿠폰 두 장을 겹쳐 나온 값이면 "최적"이다(ADR-019) — 그래야
                    // 상세의 사다리와 칩의 배지가 같은 말을 한다. 둘 다 견줄 수 있는
                    // 값이라 정렬에서 빠지지 않는다(confirmedSortingAmount).
                    compound.isEmpty() ? BANNER_QUALIFIER : CUMULATIVE_QUALIFIER,
                    false,
                    "banner",
                    null,
                    banner.amount(),
                    // 오늘 확인한 행사다. capturedAt이 오늘이라 같은 앱에
                    // 어제 캡처된 오퍼가 있으면 이쪽이 이긴다(Offer.preferredOver).
                    today,
                    null,
                    // 적혀 있으면 조건으로 함께 들어간다. 없으면 상세에
                    // "최소주문 미확인"이 뜬다 — 감추지 않는다.
                    banner.effectiveMinOrder(),
                    // 복합쿠폰이면 구간 둘을 겹쳐 놓는다(ADR-019). 아니면 둘 다
                    // null이라 지금까지와 같은 대표값 하나짜리다.
                    compound.isEmpty() ? null : "cumulative",
                    compound.isEmpty() ? null : compound,
                    banner.extra(),
                    banner.endsOn().toString(),
                    // 기간 문구를 배지로 올린다 — "오전 11시부터 선착순"이
                    // 안 보이면 아무 때나 받을 수 있는 할인으로 읽힌다.
                    banner.period(),
                    // 행사 딥링크를 이 오퍼가 들고 간다. 브랜드 링크
                    // (brands.yml)는 그대로 둔다 — 배너와 무관한 다른 오퍼
                    // 칩까지 행사로 끌려가면 안 되고, 배너가 끝나도 원래
                    // 링크가 남아 있어야 한다.
                    banner.url(),
                    null));
        }
        return records;
    }

    private static Integer amountOf(String text) {
        if (text == null) return null;
        Matcher m = BANNER_AMOUNT.matcher(text);
        if (!m.find()) return null;
        try {
            return Integer.valueOf(m.group(1).replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
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
            // 확정 오퍼가 정렬에 기여하는 금액은 qualifier에 따라 다르다
            // ({@link #confirmedSortingAmount}). 프론트가 카드 안에서 쓰는
            // bestAmount는 이미 qualifier를 빼고 고르는데 여기가 안 빼서
            // 두 레이어가 다른 답을 내고 있었다(ADR-016).
            //
            // maxHeld는 그대로 둔다 — 확정이 하나도 없는 브랜드끼리만 줄
            // 세우는 내부값이고, 그 브랜드들은 이미 확정 있는 브랜드 전부
            // 아래에 깔린다. 여기서까지 빼면 정렬 근거가 없어져 삽입 순서로
            // 흩어진다.
            if (offer.amount() != null) {
                boolean confirmed = record.status().isConfirmed();
                Integer forSorting = confirmed
                        ? confirmedSortingAmount(offer)
                        : offer.amount();
                if (forSorting == null) {
                    continue;
                }
                Map<String, Integer> target = confirmed ? maxConfirmed : maxHeld;
                target.merge(name, forSorting, Math::max);
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

    /**
     * 특정 메뉴 한정 쿠폰이 정렬에서 갖는 값.
     *
     * <p>액면은 크지만(열정국밥 배민 14,000원) 메뉴 하나에만 쓰는 값이라
     * 브랜드 전체에 걸리는 일반 할인과 같은 선에서 견줄 수 없다. 그렇다고
     * 정렬에서 통째로 빼면 그 쿠폰밖에 없는 브랜드가 근거를 잃는다.
     *
     * <p>5,000원 바로 아래에 둔다 — 일반 할인 5,000원짜리를 절대 못 넘고,
     * 그보다 작은 일반 할인보다는 위에 선다.
     */
    private static final int MENU_LIMITED_SORTING_AMOUNT = 4999;

    /** 배너에서 온 오퍼임을 화면에 알리는 표식. 프론트가 배지로 그린다. */
    private static final String BANNER_QUALIFIER = "행사";

    /** 겹쳐 쓰는 쿠폰의 대표값임을 알리는 표식. 원장과 같은 말을 쓴다. */
    private static final String CUMULATIVE_QUALIFIER = "최적";

    /**
     * 확정 오퍼가 카드 정렬(maxConfirmedAmount)에 기여하는 금액.
     * 견줄 수 없는 값이면 {@code null}이라 아예 안 들어간다.
     */
    private static Integer confirmedSortingAmount(Offer offer) {
        String qualifier = offer.qualifier();
        if (qualifier == null) {
            return offer.amount();
        }
        if ("특정메뉴".equals(qualifier)) {
            return MENU_LIMITED_SORTING_AMOUNT;
        }
        // "최대"(화면 배지 "불확정")만 뺀다. 최소주문금액을 채워야 나오는
        // 상한액이라 얼마를 받는지가 아직 정해지지 않은 값이다.
        //
        // "최적"(쿠폰을 다 겹쳤을 때)과 "행사"(당일 배너)는 넣는다 — 조건은
        // 붙지만 액수 자체는 확정이고, 빼두면 그 브랜드에서 실제로 받을 수
        // 있는 가장 큰 값이 화면에서 사라진다.
        //
        // 프론트의 isBest(App.jsx)가 같은 규칙을 들고 있다. 한쪽만 고치면
        // 카드 정렬과 카드 안 "최고 할인" 표식이 서로 다른 답을 낸다(ADR-016).
        if ("최대".equals(qualifier)) {
            return null;
        }
        return offer.amount();
    }
}
