package com.discounttracker.comparison;

import com.discounttracker.banner.Banner;
import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.banner.BannerText;
import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.Certainty;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferComparison;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(BrandComparisonService.class);

    private final OfferRepository offers;
    private final BrandCatalog brands;
    private final BannerCatalog banners;
    private final Clock clock;

    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock) {
        this(offers, brands, banners, clock, null, "");
    }

    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock, String hideUnlinkedPlatforms) {
        this(offers, brands, banners, clock, null, hideUnlinkedPlatforms);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock,
                                  com.discounttracker.analytics.PopularityIndex popularity,
                                  @org.springframework.beans.factory.annotation.Value("${discount.hide-unlinked-platforms:yogiyo}")
                                  String hideUnlinkedPlatforms) {
        this.offers = offers;
        this.brands = brands;
        this.banners = banners;
        this.clock = clock;
        this.popularity = popularity;
        this.unlinkedHidden = java.util.Arrays.stream((hideUnlinkedPlatforms == null ? "" : hideUnlinkedPlatforms).split(","))
                .map(String::trim).filter(x -> !x.isEmpty()).collect(java.util.stream.Collectors.toSet());
    }

    /** 인기 점수(2026-09-19). 테스트처럼 없으면 전부 0. */
    private final com.discounttracker.analytics.PopularityIndex popularity;

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

    /**
     * 오늘 띄우는 배너 중 오퍼로 세울 수 있는 것.
     *
     * <p>브랜드가 없는 배너(앱 전체 행사)는 붙을 카드가 없어서 뺀다. 구조 칸
     * ({@code amount:} 덩이)이 없는 배너 — 문장만 적은 옛 모양 — 도 뺀다. 문장을
     * 다시 읽지 않기 때문이다(Task 8). 자사 배너는 2026-09-22부터 넣는다 - 브랜드
     * 자체 앱이나 사이트의 행사도 그 브랜드를 보는 사람에게는 고를 수 있는 값이다.
     *
     * <p>정률 배너는 대표 정액(headline)이 없다 — 그래도 카드에는 선다. 다만 최고 할인
     * 비교에는 못 들어간다(액수 자체가 없어서).
     *
     * <p>묶음은 접지 않는다. 브랜드마다 오퍼가 하나씩 선다.
     */
    private List<OfferRecord> bannerRecords() {
        // capturedAt은 날짜가 아니라 시각까지 있어야 한다. Offer.preferredOver가
        // 문자열로 그냥 비교하는데("2026-09-03" vs "2026-09-03T12:00:00+09:00"),
        // 날짜만 넣으면 같은 날 찍힌 원장 레코드보다 "더 이르다"고 읽혀
        // 배너가 항상 진다 — 오늘 등록한 배너가 어제 원장 값에 안 이겨서
        // 카드에 안 뜨는 사고가 났다(사용자 확인, 2026-09-03).
        String today = java.time.OffsetDateTime.now(clock).toString();
        List<OfferRecord> records = new ArrayList<>();
        for (Banner banner : banners.activeMembers()) {
            if (banner.brand() == null) continue;
            if (banner.amountSpec() == null) continue;
            records.add(new OfferRecord(
                    banner.platform(),
                    banner.brand(),
                    banner.amountSpec().headline(),
                    // 표식은 칸에서 나온다. 타겟딜은 계정에 따라 갈리므로 상한과 같은 성질이다.
                    qualifierOf(banner),
                    false,
                    "banner",
                    null,
                    banner.amount(),
                    today,
                    null,
                    banner.minOrder(),
                    null,
                    null,
                    BannerText.conditions(banner),
                    banner.endsOn().toString(),
                    banner.period(),
                    banner.url(),
                    banner.spec() == null ? null : banner.spec().membership(),
                    banner.soldOut()));
        }
        return records;
    }

    /**
     * 이행 기간에만 남는 다리. 원장 표기를 배너 칸에서 만든다.
     *
     * <p>{@code OfferRecord}가 아직 {@code qualifier}만 들고 있어서, 배너 칸에서 정한
     * 확실성을 원장 표기로 한 번 돌려 적는다({@link Certainty#fromQualifier}가 되짚는다).
     * Task 19에서 {@code OfferRecord}가 확실성을 직접 갖게 되면 이 메서드가 사라진다.
     */
    private static String qualifierOf(Banner banner) {
        Certainty c = banner.isTargeted() ? Certainty.CAPPED : banner.amountSpec().certainty();
        return switch (c) {
            case CAPPED -> "최대";
            case PERCENT -> "정률";
            case RANDOM -> "랜덤";
            case MENU_ONLY -> "특정메뉴";
            case EXACT -> null;
        };
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
            // 요기요는 브랜드 링크(brands.yml links.yogiyo)가 없으면 칩을 눌러도 앱만 켜지고 그 브랜드로
            // 못 간다(2026-09-21 토핑몬스터피자). 그런 오퍼는 화면에 안 낸다 — 배너 유래(자기 링크)는 예외.
            if (unlinkedHidden.contains(record.platform()) && record.link() == null
                    && brands.find(name).links().get(record.platform()) == null) {
                continue;
            }
            Offer offer = Offer.from(record, today);

            // 앱마다 오퍼 하나가 대표다. 다만 뽑기 오퍼(랜덤)는 확정 오퍼와 **다른 자리**에 둔다 —
            // 같은 자리에 두면 확정액이 이겨 상한이 사라진다(2026-09-20 노모어·푸라닭). 원장
            // 쪽(store.offer_key)과 같은 규칙.
            String slot = offer.certainty() == Certainty.RANDOM
                    ? record.platform() + "#random" : record.platform();
            Map<String, Offer> offersOnPlatform = byBrand.computeIfAbsent(name, k -> new LinkedHashMap<>());

            // 배너와 원장이 같은 (브랜드, 앱)을 서로 다른 확실성으로 볼 수 있다 — 사람이
            // 배너에 "최대"라 적었는데 원장은 확정으로 캡처했거나 그 반대다. 조용히
            // 하나를 택해 버리면 그 어긋남이 아무도 모르게 묻힌다.
            Offer existing = offersOnPlatform.get(slot);
            if (existing != null && existing.fromBanner() != offer.fromBanner()
                    && existing.certainty() != offer.certainty()) {
                log.warn("배너와 원장의 확실성이 다르다 - 브랜드={}, 플랫폼={}, 배너 확실성={}, 원장 확실성={}",
                        name, record.platform(),
                        offer.fromBanner() ? offer.certainty() : existing.certainty(),
                        offer.fromBanner() ? existing.certainty() : offer.certainty());
            }
            offersOnPlatform.merge(slot, offer, Offer::preferredOver);

            // 원장의 금액이 아니라 오늘 기준 금액을 쓴다 — 만료된 구간 때문에
            // 대표값이 내려갔으면 카드 대표 금액과 정렬도 같이 내려가야 한다.
            //
            // 확정 오퍼가 정렬에 기여하는 금액은 확실성에 따라 다르다
            // ({@link OfferComparison#sortingAmount}). 프론트의 filters.js가 같은
            // 판정표(docs/contracts/certainty-cases.json)를 읽어 어긋남을 막는다(ADR-016).
            //
            // maxHeld는 그대로 둔다 — 확정이 하나도 없는 브랜드끼리만 줄
            // 세우는 내부값이고, 그 브랜드들은 이미 확정 있는 브랜드 전부
            // 아래에 깔린다. 여기서까지 빼면 정렬 근거가 없어져 삽입 순서로
            // 흩어진다.
            if (offer.amount() != null) {
                boolean confirmed = record.status().isConfirmed();
                Integer forSorting = confirmed
                        ? OfferComparison.sortingAmount(offer.certainty(), offer.amount())
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
                new ArrayList<>(offersByPlatform.values()),
                popularity == null ? 0 : popularity.scoreOf(name))));

        result.sort(BrandComparison.byBestDiscount());
        return result;
    }

    /** 브랜드 링크 없이는 그 브랜드에 못 가는 앱 — 링크 없는 오퍼는 숨긴다(application.yml
     * discount.hide-unlinked-platforms, 기본 yogiyo). 테스트의 4인자 생성자는 비어 있다. */
    private final java.util.Set<String> unlinkedHidden;
}
