package com.discounttracker.comparison;

import com.discounttracker.banner.Banner;
import com.discounttracker.banner.BannerAmount;
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
     * ({@code amount:} 덩이)이 없는 배너 — 문장만 적은 옛 모양 — 는 {@link #legacyRecords}
     * 로 내려간다(RULES 12). 자사 배너는 2026-09-22부터 넣는다 - 브랜드
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
            BannerAmount amountSpec = banner.amountSpec();
            // 구조 칸에 금액이 없으면 옛 경로로 내려간다(RULES 12). 여기서 건너뛰면
            // 문자열 amount로 적힌 배너 전부가 브랜드 카드에서 조용히 사라진다 -
            // 라이브 9장이 전부 그 모양이었다. 옛 limit(cashback/random)만 보고 만든
            // 껍데기 amountSpec(BannerCatalog)도 금액이 없어 같이 내려간다.
            //
            // 이 갈림길은 라이브 banners.yml에 문자열 amount 행이 0장이 되는 날
            // 지운다 - RULES 9가 만료 배너를 그대로 두기로 했으므로 그날은 영영 안
            // 올 수도 있다. 몇 장 남았는지는 beggars-ops의
            // `python tools/convert_banners.py --file <banners.yml>`이 센다.
            if (amountSpec == null || (amountSpec.headline() == null && amountSpec.percent() == null)) {
                records.addAll(legacyRecords(banner, today));
                continue;
            }
            // 정률 배너는 배달앱에서는 오퍼로 안 선다(2026-09-22 되돌림). headline()이 없어
            // amount null인 채로 서면 "금액 미확인" 칩이 뜨고, 그걸 가리려 배지에 퍼센트를
            // 적으면 App.jsx의 status-badge 한 자리를 차지해 기간·시각 배지가 사라진다
            // (2026-09-21 고정을 되돌리는 셈이었다). 배달앱 정률 배너는 원래(Task 8 이전)
            // 오퍼로 안 섰으니 그대로 두는 편이 무회귀다. own은 예외로 그대로 세운다 -
            // brief의 ownBannerNowStandsAsAnOffer(50% 캐시백)가 이 값을 요구한다. 정률을
            // 제대로 그리는 일(App.jsx가 별도 자리를 만드는 일)은 Task 17·18이 한다.
            if (amountSpec.percent() != null && !Banner.OWN.equals(banner.platform())) continue;
            records.add(new OfferRecord(
                    banner.platform(),
                    banner.brand(),
                    amountSpec.headline(),
                    // 표식은 칸에서 나온다. 타겟딜은 계정에 따라 갈리므로 상한과 같은 성질이다.
                    qualifierOf(banner),
                    false,
                    "banner",
                    // section 자리는 원장에서는 화면 섹션 제목 그대로다(ADR-006). 배너
                    // 레코드에는 그 개념이 없고 tracker가 offerType="banner"인 행을 낼 일도
                    // 없어 두 뜻이 안 섞인다 - 여기서는 배너 id만 싣는다(확실성 경고 로그가
                    // 브랜드·플랫폼만으로 못 찾는 배너를 이걸로 찾는다).
                    banner.id(),
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
                    banner.soldOut(),
                    // 무엇을 주는가 - own 배너의 캐시백/적립까지 discount로 뭉개면 확정
                    // 할인처럼 최고 할인 후보에 낄 수 있다(2026-09-22 fix round).
                    amountSpec.kind().key()));
        }
        return records;
    }

    /**
     * 옛 모양 배너(문자열 {@code amount})가 세우는 오퍼. 브랜드마다 하나씩 선다.
     *
     * <p>{@code origin/main}이 같은 자리에서 하던 일 그대로다 -
     * {@link Banner#brandAmounts()}가 "7/6/6/5천원" 같은 나열을 브랜드 순서로 짝짓고,
     * {@link Banner#compoundTiers()}가 겹쳐 쓴 쿠폰을 구간으로 풀고,
     * {@link Banner#effectiveMinOrder()}가 {@code extra} 문장에서 문턱을 되짚는다.
     * RULES 1이 이 셋을 지우지 말라고 한 자리가 여기다.
     *
     * <p>자사(own)와 정률 취급은 새 경로와 같다. 정률만 적은 옛 배너("최대 30%")는
     * {@code brandAmounts()}가 빈 목록을 내므로 저절로 안 선다 - 따로 막지 않는다.
     */
    private List<OfferRecord> legacyRecords(Banner banner, String today) {
        List<com.discounttracker.offer.DiscountTier> compound = banner.compoundTiers();
        String qualifier = legacyQualifier(banner);
        List<OfferRecord> out = new ArrayList<>();
        for (Map.Entry<String, Integer> pair : banner.brandAmounts()) {
            out.add(new OfferRecord(
                    banner.platform(),
                    pair.getKey(),
                    pair.getValue(),
                    qualifier,
                    false,
                    "banner",
                    // 새 경로와 같이 배너 id를 싣는다 - 확실성 경고 로그가 이 값으로
                    // 어느 배너인지 찾는다(origin/main은 null이었다, 그때는 그 로그가 없었다).
                    banner.id(),
                    banner.amount(),
                    today,
                    null,
                    banner.effectiveMinOrder(),
                    compound.isEmpty() ? null : "cumulative",
                    compound.isEmpty() ? null : compound,
                    legacyConditions(banner),
                    banner.endsOn().toString(),
                    banner.period(),
                    banner.url(),
                    banner.spec() == null ? null : banner.spec().membership(),
                    banner.soldOut(),
                    banner.amountSpec() == null ? null : banner.amountSpec().kind().key()));
        }
        return out;
    }

    /**
     * 옛 경로로 선 오퍼의 확실성. 옛 규칙 그대로다(RULES 12).
     *
     * <p>뽑기가 먼저다 - 랜덤 배너는 대개 "최대 7,000원"이라고 적힌다. 그 다음이 금액
     * 문구의 "최대", 그 다음이 타겟딜이다(계정마다 갈리니 상한과 같은 성질). 나머지는
     * 확정이다.
     *
     * <p>{@code origin/main}의 {@code isRandom}은 {@code spec.limit() == "random"}을 봤는데
     * 지금은 {@code BannerCatalog}가 그 칸을 {@code amountSpec.random}으로 옮겨 담는다 -
     * 같은 사실을 새 자리에서 읽는다. {@code isTargeted}의 {@code extra}에 적힌 "타겟딜"도
     * 마찬가지로 {@code banner.targeted}로 옮겨 담기는데, 문장에만 적고 칸은 비운 옛 행이
     * 남아 있어 문장도 함께 본다. {@code origin/main}이 겹침에 붙이던 "최적"은 안 쓴다 -
     * {@link Certainty#fromQualifier}가 그것을 EXACT로 읽어 값이 같고, 겹침이라는 사실은
     * {@code tierMode}가 이미 답한다.
     */
    private static String legacyQualifier(Banner banner) {
        if (legacyRandom(banner)) return "랜덤";
        if (banner.amount() != null && banner.amount().contains("최대")) return "최대";
        if (legacyTargeted(banner)) return "최대";
        return null;
    }

    private static boolean legacyRandom(Banner banner) {
        if (banner.amountSpec() != null && banner.amountSpec().certainty() == Certainty.RANDOM) return true;
        String text = (banner.period() == null ? "" : banner.period())
                + " " + (banner.extra() == null ? "" : banner.extra());
        return text.contains("랜덤");
    }

    private static boolean legacyTargeted(Banner banner) {
        return banner.isTargeted() || (banner.extra() != null && banner.extra().contains("타겟딜"));
    }

    /**
     * 옛 경로의 조건 줄.
     *
     * <p>구조 칸에서 먼저 만든다. 사람이 적은 {@code extra}를 쓰면 구조 칸과 같은 말이
     * 두 번 나온다 - 2026-09-24 실측: 반올림피자 오퍼 조건에 "/ 쿠팡와우 전용"이 떴는데
     * 그 자격은 {@code membership} 칸으로 이미 배지에 뜨고 있었고, 최소주문을 떼어낸
     * 자리에 슬래시만 덜렁 남은 모양이었다. 새 모양 배너(두찜)는 같은 자리에 "발급
     * 선착순"만 낸다 - 두 경로가 같은 답을 내야 한다.
     *
     * <p>구조 칸이 아무 말도 못 만들면(옛 배너에 firstCome도 targeted도 없을 때)
     * {@code extra}에서 최소주문 언급만 뺀 문장으로 떨어진다. 타겟딜이면 "한정"을 붙인다.
     */
    private static String legacyConditions(Banner banner) {
        String structured = BannerText.conditions(banner);
        String base = structured != null ? structured : banner.displayConditions();
        if (!legacyTargeted(banner)) return base;
        if (base == null) return "한정";
        return base.contains("한정") ? base : base + " · 한정";
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
            // MENU_ONLY는 여기 안 나온다 - BannerAmount.certainty()가 낼 수 있는 값이
            // EXACT/CAPPED/RANDOM/PERCENT뿐이다(특정 메뉴 한정은 원장 qualifier
            // "특정메뉴"에서만 나온다). default 대신 이름을 적어 둔다 - Certainty에
            // 여섯째 값이 생기면 이 스위치가 조용히 새지 말고 컴파일이 깨져야 한다.
            case MENU_ONLY, EXACT -> null;
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
        // 확실성 어긋남 경고에 배너 id를 실으려고 슬롯마다 마지막으로 본 배너 id를
        // 따로 든다. Offer는 출처(fromBanner)만 알고 자기가 어느 배너였는지는 모른다.
        Map<String, Map<String, String>> bannerIdBySlot = new LinkedHashMap<>();

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
            Map<String, String> bannerIdsHere = bannerIdBySlot.computeIfAbsent(name, k -> new LinkedHashMap<>());
            if (existing != null && existing.fromBanner() != offer.fromBanner()
                    && existing.certainty() != offer.certainty()) {
                // 배너 레코드가 항상 원장보다 먼저 처리된다(compare()가 bannerRecords()를
                // 원장 앞에 붙인다) - 그래서 어긋남이 걸리는 시점엔 existing이 배너, offer가
                // 원장이다. offer가 배너인 경우는 실제 경로에서 안 나온다(2-인자 compare에
                // 순서를 뒤집어 넘기는 테스트가 아니면). 브랜드 하나에 배너가 여러 장일 수
                // 있어 브랜드·플랫폼만으로는 어느 배너인지 못 찾는다 - id를 같이 남긴다.
                log.warn("배너와 원장의 확실성이 다르다 - 배너={}, 브랜드={}, 플랫폼={}, 배너 확실성={}, 원장 확실성={}",
                        bannerIdsHere.get(slot), name, record.platform(),
                        existing.certainty(), offer.certainty());
            }
            if (offer.fromBanner()) {
                bannerIdsHere.put(slot, record.section());
            }
            offersOnPlatform.merge(slot, offer, Offer::preferredOver);

            // 원장의 금액이 아니라 오늘 기준 금액을 쓴다 — 만료된 구간 때문에
            // 대표값이 내려갔으면 카드 대표 금액과 정렬도 같이 내려가야 한다.
            //
            // 오퍼가 정렬에 기여하는 금액은 확실성에 따라 다르다
            // ({@link OfferComparison#comparisonAmount}). 프론트의 filters.js가 같은
            // 판정표(docs/contracts/certainty-cases.json)를 읽어 어긋남을 막는다(ADR-016).
            //
            // own(자사)과 비할인(캐시백·포인트), 품절 오퍼는 maxConfirmed·maxHeld
            // 어느 쪽도 못 채운다 — 배달앱끼리 겨루는 값이 아니라 어느 쪽 천장도 그
            // 값으로 정할 수 없다(2026-09-22 fix round 2: 자사 확정액이 "최고 할인"으로
            // 새던 자리, 배달앱 캐시백까지 확정 할인으로 셌던 구멍; 2026-09-23 fix round 3:
            // 품절도 같은 문). 규칙은 {@link OfferComparison#comparisonAmount} 한 곳에만
            // 적는다 — 호출 한 번으로 maxConfirmed·maxHeld 둘 다 같은 값을 쓴다, 나눠
            // 물으면 한쪽만 고쳐도 안 터진다.
            //
            // 보류(maxHeld) 쪽은 "최대"(CAPPED)도 금액을 낸다 - 확정 오퍼가 없는
            // 브랜드끼리만 줄 세우는 값이라 견주는 값이 다 미확정이고, 빼면 상한
            // 보류 브랜드가 전부 0으로 묶여 흩어진다(2026-09-23 fix round 4).
            boolean confirmed = record.status().isConfirmed();
            Integer forSorting = OfferComparison.comparisonAmount(offer.certainty(), offer.kind(),
                    offer.soldOut(), record.platform(), offer.amount(), confirmed);
            if (forSorting != null) {
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
