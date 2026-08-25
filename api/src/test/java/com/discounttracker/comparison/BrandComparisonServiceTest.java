package com.discounttracker.comparison;

import com.discounttracker.banner.BannerCatalog;
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
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BrandComparisonServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    /**
     * 만료 판정 기준 시각을 못박는다. 실제 시계를 쓰면 종료일이 든 레코드가
     * 어느 날부터 조용히 걸러져서, 어제까지 통과하던 테스트가 오늘 깨진다.
     */
    private static final Clock FIXED_TODAY =
            Clock.fixed(Instant.parse("2026-08-05T03:00:00Z"), SEOUL); // KST 2026-08-05 12:00

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
        return serviceWith(records, yaml, FIXED_TODAY);
    }

    private BrandComparisonService serviceWith(List<OfferRecord> records, String yaml, Clock clock) {
        return serviceWith(records, yaml, clock, "banners: []");
    }

    private BrandComparisonService serviceWith(List<OfferRecord> records, String yaml,
                                               Clock clock, String bannerYaml) {
        BrandCatalog brands = catalogWith(yaml);
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(bannerYaml.getBytes(StandardCharsets.UTF_8)), clock, brands);
        return new BrandComparisonService(repositoryWith(records), brands, banners, clock);
    }

    /** KST 기준 그 날짜 정오를 가리키는 시계. */
    private Clock on(String date) {
        return Clock.fixed(Instant.parse(date + "T03:00:00Z"), SEOUL);
    }

    private OfferRecord rec(String platform, String brand, Integer amount,
                            String qualifier, boolean needsReview) {
        return new OfferRecord(platform, brand, amount, qualifier, needsReview,
                "discount", null, amount == null ? "" : amount + "원",
                "2026-07-27T14:20:00+09:00", "path.jpg", null, null, null, null, null, null, null, false);
    }

    private OfferRecord recWithConditions(String platform, String brand, Integer amount,
                                          boolean needsReview, Integer minOrder, String conditions) {
        return new OfferRecord(platform, brand, amount, null, needsReview,
                "discount", null, amount == null ? "" : amount + "원",
                "2026-07-29T18:00:00+09:00", "path2.jpg", minOrder, null, null, conditions, null, null, null, false);
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
    void qualifiedAmountsDoNotFeedMaxConfirmed() {
        // "최대"는 최소주문금액을 채워야 나오는 상한액이라(화면 배지가
        // "불확정") 확정 정액과 같은 선에서 견줄 수 없다. 액면이 더 커도
        // 카드 대표 금액이 되면 안 된다.
        var result = serviceWith(
                List.of(rec("baemin", "브랜드", 3000, null, false),
                        rec("yogiyo", "브랜드", 8000, "최대", false)),
                "brands: {}").compare();
        assertEquals(3000, result.get(0).maxConfirmedAmount());
    }

    @Test
    void qualifiedOnlyBrandDoesNotOutrankAConfirmedOne() {
        // 불확정 8,000원이 확정 5,000원 위로 올라가면 카드 정렬이 거짓말을
        // 한다. 확정이 없는 브랜드는 확정 있는 브랜드 아래로 내려간다.
        var result = serviceWith(
                List.of(rec("yogiyo", "불확정만", 8000, "최대", false),
                        rec("baemin", "확정있음", 5000, null, false)),
                "brands: {}").compare();
        assertEquals("확정있음", result.get(0).name());
        assertEquals("불확정만", result.get(1).name());
    }

    @Test
    void menuLimitedOffersSortJustBelowFiveThousand() {
        // 열정국밥 배민 실측: 액면 14,000원이지만 메뉴 하나에만 쓴다.
        // 브랜드 전체에 걸리는 5,000원 일반 할인을 못 넘어야 한다.
        var result = serviceWith(
                List.of(rec("baemin", "메뉴한정", 14000, "특정메뉴", false),
                        rec("baemin", "일반할인", 5000, null, false)),
                "brands: {}").compare();
        assertEquals("일반할인", result.get(0).name());
        assertEquals("메뉴한정", result.get(1).name());
        assertEquals(4999, result.get(1).maxConfirmedAmount());
    }

    @Test
    void menuLimitedOffersStillOutrankSmallerGeneralDiscounts() {
        // 정렬에서 통째로 빼면 그 쿠폰밖에 없는 브랜드가 근거를 잃는다.
        var result = serviceWith(
                List.of(rec("baemin", "소액할인", 3000, null, false),
                        rec("baemin", "메뉴한정", 14000, "특정메뉴", false)),
                "brands: {}").compare();
        assertEquals("메뉴한정", result.get(0).name());
        assertEquals("소액할인", result.get(1).name());
    }

    @Test
    void menuLimitedFaceAmountStaysOnTheOffer() {
        // 정렬용 대체값이지 표시값이 아니다 — 칩엔 14,000원이 그대로 뜬다.
        var result = serviceWith(
                List.of(rec("baemin", "메뉴한정", 14000, "특정메뉴", false)),
                "brands: {}").compare();
        assertEquals(14000, result.get(0).offers().get(0).amount());
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
    void dedupePrefersMoreRecentConfirmedOverOlderLargerAmount() {
        // bhc 실측(2026-07-31): alias(대소문자 "bhc"/"BHC")로 묶인 두
        // 레코드 중 옛날 리스트 캡처(3,500원, 2026-07-27)가 방금 상세를
        // 확인한 새 레코드(3,000원, 2026-07-31)보다 금액이 커서, 예전
        // "금액 큰 쪽" 규칙이면 새로 확인한 최소주문금액이 통째로 묻혔다.
        var result = serviceWith(
                List.of(
                        rec("baemin", "브랜드", 3500, null, false),
                        recWithConditions("baemin", "브랜드", 3000, false, 18000, null)),
                "brands: {}").compare();
        Offer offer = result.get(0).offers().get(0);
        assertEquals(3000, offer.amount());
        assertEquals(18000, offer.minOrderAmount());
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
    void dedupeMergesLoserDetailFieldsOntoWinnerWhenAmountMatches() {
        // 확정으로 이긴 오퍼 자체엔 상세가 없고, 나중에 재확인하며 조건만
        // 캡처한(needs_review) 오퍼가 진 경우 — 같은 금액이면 같은 쿠폰의
        // 재확인일 가능성이 크므로 그 조건을 버리면 안 된다.
        var result = serviceWith(
                List.of(
                        rec("ddangyo", "브랜드", 5000, "최대", false),
                        recWithConditions("ddangyo", "브랜드", 5000, true, null, "메뉴 한정 쿠폰")),
                "brands: {}").compare();
        Offer offer = result.get(0).offers().get(0);
        assertEquals(5000, offer.amount());
        assertEquals(OfferStatus.CONFIRMED, offer.status());
        assertEquals("메뉴 한정 쿠폰", offer.conditions());
    }

    @Test
    void dedupeDoesNotMergeLoserDetailWhenAmountsDiffer() {
        // 훌랄라참숯바베큐치킨 실측(2026-07-31): 땡겨요의 확정 5,000원
        // 오퍼(전체 메뉴)와 다른 needs_review 12,100원 오퍼(순살 참숯구이
        // 한정 쿠폰)는 금액이 달라 서로 다른 쿠폰이다. 조건을 섞어 붙이면
        // 5,000원 오퍼가 그 메뉴로 한정된 것처럼 잘못 보인다.
        var result = serviceWith(
                List.of(
                        rec("ddangyo", "브랜드", 5000, "최대", false),
                        recWithConditions("ddangyo", "브랜드", 12100, true, null, "메뉴 한정 쿠폰")),
                "brands: {}").compare();
        Offer offer = result.get(0).offers().get(0);
        assertEquals(5000, offer.amount());
        assertEquals(OfferStatus.CONFIRMED, offer.status());
        assertNull(offer.conditions());
    }

    @Test
    void dedupeMergesLoserDetailWhenLoserAmountIsUnknown() {
        // 꾸브라꼬숯불치킨 실측(2026-07-31): 자동 매칭에 실패해 amount를
        // 비워 두고 conditions에 원문만 남긴 기록은 "다른 쿠폰"이라고
        // 단정할 근거가 없다 — 병합을 막으면 상세를 확인하려 시도했다는
        // 사실 자체가 사라진다.
        var result = serviceWith(
                List.of(
                        rec("ddangyo", "브랜드", 6000, "최대", false),
                        recWithConditions("ddangyo", "브랜드", null, true, null, "쿠폰 2종 - 자동 매칭 안 됨")),
                "brands: {}").compare();
        Offer offer = result.get(0).offers().get(0);
        assertEquals(6000, offer.amount());
        assertEquals(OfferStatus.CONFIRMED, offer.status());
        assertEquals("쿠폰 2종 - 자동 매칭 안 됨", offer.conditions());
    }

    @Test
    void dedupeKeepsWinnerDetailWhenWinnerAlreadyHasIt() {
        var result = serviceWith(
                List.of(
                        recWithConditions("ddangyo", "브랜드", 7000, false, 22000, "1일 1회"),
                        recWithConditions("ddangyo", "브랜드", 3000, true, 10000, "다른 조건")),
                "brands: {}").compare();
        Offer offer = result.get(0).offers().get(0);
        assertEquals(7000, offer.amount());
        assertEquals(22000, offer.minOrderAmount());
        assertEquals("1일 1회", offer.conditions());
    }

    @Test
    void carriesDetailFieldsThroughToOffer() {
        // 상세 패널이 읽는 값 — 서비스는 해석하지 않고 그대로 흘려보낸다.
        OfferRecord detailed = new OfferRecord("yogiyo", "굽네치킨", 7000, "최대", true,
                "discount", null, "최대 7,000원 할인", "2026-07-27T14:25:00+09:00",
                "x.jpg", 15000, null, List.of(new DiscountTier(15000, 3000, null, null, null, null, null)), "1일 1회",
                "2026-08-31", "선착순 품절", null, true);
        Offer offer = serviceWith(List.of(detailed), "brands: {}")
                .compare().get(0).offers().get(0);
        assertEquals(15000, offer.minOrderAmount());
        assertEquals("1일 1회", offer.conditions());
        assertEquals(3000, offer.tiers().get(0).amount());
        assertEquals("2026-07-27T14:25:00+09:00", offer.capturedAt());
        assertEquals("2026-08-31", offer.expiresAt());
        assertEquals("선착순 품절", offer.badge());
        assertEquals(true, offer.soldOut());
    }

    @Test
    void carriesTierModeThroughToOffer() {
        // 프론트가 "겹치는 쿠폰이 더 있다"(+a 표시)를 판단하는 근거라
        // 응답까지 그대로 나가야 한다.
        OfferRecord cumulative = new OfferRecord("yogiyo", "굽네치킨", 5250, "최적", false,
                "discount", null, "최적 5,250원", "2026-07-31T10:00:00+09:00",
                "x.jpg", null, "cumulative", List.of(
                        new DiscountTier(17000, 4000, null, null, null, null, null),
                        new DiscountTier(25000, 1250, 5, 3000, null, null, null)),
                null, null, null, null, false);
        Offer offer = serviceWith(List.of(cumulative), "brands: {}")
                .compare().get(0).offers().get(0);
        assertEquals("cumulative", offer.tierMode());
        assertEquals(5250, offer.amount());
        assertEquals(3000, offer.tiers().get(1).cap());
    }

    @Test
    void exposesCategoryAndLinksFromCatalog() {
        var result = serviceWith(
                List.of(rec("ddangyo", "BBQ", 4000, "최대", false)),
                """
                brands:
                  BBQ:
                    category: chicken
                    links:
                      ddangyo: https://example.test/bbq
                      baemin: https://s.baemin.com/bbq
                """).compare();
        assertEquals(Category.CHICKEN, result.get(0).brand().category());
        assertEquals("chicken", result.get(0).categoryKey());
        assertEquals("https://example.test/bbq", result.get(0).links().get("ddangyo"));
        assertEquals("https://s.baemin.com/bbq", result.get(0).links().get("baemin"));
    }

    @Test
    void brandMissingFromCatalogHasNullCategoryAndNoLinks() {
        // brands.yml에 아직 안 넣은 브랜드도 화면에는 떠야 한다(카테고리만 비어 있음).
        var result = serviceWith(
                List.of(rec("baemin", "신규브랜드", 5000, null, false)), "brands: {}").compare();
        assertEquals("신규브랜드", result.get(0).name());
        assertNull(result.get(0).categoryKey());
        assertTrue(result.get(0).links().isEmpty());
    }

    // --- 종료일 만료 (ADR-008) ---

    /** 종료일·캡처시각을 지정하는 레코드. */
    private OfferRecord recExpiring(String platform, String brand, Integer amount,
                                    String expiresAt, String capturedAt) {
        return new OfferRecord(platform, brand, amount, null, false,
                "discount", null, amount + "원", capturedAt, "path.jpg",
                null, null, null, null, expiresAt, null, null, false);
    }

    @Test
    void keepsOfferOnDayBeforeExpiry() {
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 5000, "2026-08-31", "2026-08-01T10:00:00+09:00")),
                "brands: {}", on("2026-08-30")).compare();
        assertEquals(1, result.size());
    }

    @Test
    void keepsOfferOnItsExpiryDate() {
        // "~2026.08.31 사용가능"은 그 날 자정까지 쓸 수 있다는 뜻이다.
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 5000, "2026-08-31", "2026-08-01T10:00:00+09:00")),
                "brands: {}", on("2026-08-31")).compare();
        assertEquals(1, result.size());
        assertEquals(5000, result.get(0).offers().get(0).amount());
    }

    @Test
    void dropsOfferAfterExpiryDate() {
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 5000, "2026-08-31", "2026-08-01T10:00:00+09:00")),
                "brands: {}", on("2026-09-01")).compare();
        assertTrue(result.isEmpty(), "종료일 다음 날이면 오퍼가 남지 않는다");
    }

    @Test
    void keepsOfferWithoutExpiryDate() {
        // 원장 대부분이 종료일 미확인이다. 모른다는 것과 끝났다는 것은 다르다.
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 5000, null, "2026-08-01T10:00:00+09:00")),
                "brands: {}", on("2027-01-01")).compare();
        assertEquals(1, result.size());
    }

    @Test
    void keepsOfferWithMalformedExpiryDate() {
        // 판독이 잘못됐다고 살아 있을지 모르는 할인을 조용히 감추지 않는다.
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 5000, "8월 말까지", "2026-08-01T10:00:00+09:00")),
                "brands: {}", on("2027-01-01")).compare();
        assertEquals(1, result.size());
    }

    @Test
    void expiredOfferIsExcludedFromBrandMaxAmount() {
        // 사라진 오퍼의 금액이 카드 대표값에 남으면 정렬이 거짓말을 한다.
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 7000, "2026-08-31", "2026-08-01T10:00:00+09:00"),
                        recExpiring("yogiyo", "브랜드", 3000, null, "2026-08-01T10:00:00+09:00")),
                "brands: {}", on("2026-09-01")).compare();
        assertEquals(1, result.size());
        assertEquals(1, result.get(0).offers().size());
        assertEquals(3000, result.get(0).maxConfirmedAmount());
    }

    @Test
    void expiredWinnerDoesNotTakeLiveOfferWithIt() {
        // 중복 정리를 먼저 하면 만료된 5,000원이 최신이라 승자가 되고, 그 뒤
        // 제외되면서 아직 살아 있는 3,000원까지 사라진다. 그래서 조립 전에
        // 걸러낸다.
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 5000, "2026-08-31", "2026-08-04T10:00:00+09:00"),
                        recExpiring("baemin", "브랜드", 3000, null, "2026-07-20T10:00:00+09:00")),
                "brands: {}", on("2026-09-01")).compare();
        assertEquals(1, result.size());
        assertEquals(1, result.get(0).offers().size());
        assertEquals(3000, result.get(0).offers().get(0).amount());
    }

    @Test
    void brandDisappearsWhenAllItsOffersExpired() {
        // 살아 있는 오퍼가 하나도 없으면 카드 자체가 응답에서 빠진다.
        // 원장에 없는 브랜드가 안 보이는 것과 같은 동작이다.
        var result = serviceWith(
                List.of(recExpiring("baemin", "브랜드", 5000, "2026-08-31", "2026-08-01T10:00:00+09:00"),
                        recExpiring("yogiyo", "브랜드", 3000, "2026-08-02", "2026-08-01T10:00:00+09:00")),
                "brands: {}", on("2026-09-01")).compare();
        assertTrue(result.isEmpty());
    }

    // --- 구간별 만료 (ADR-008) ---

    private DiscountTier tier(Integer minOrder, Integer amount, String expiresAt) {
        return new DiscountTier(minOrder, amount, null, null, null, null, expiresAt);
    }

    private DiscountTier soldOutTier(Integer minOrder, Integer amount) {
        return new DiscountTier(minOrder, amount, null, null, null, true, null);
    }

    private OfferRecord recWithTiers(String platform, String brand, Integer amount,
                                     String expiresAt, List<DiscountTier> tiers) {
        return new OfferRecord(platform, brand, amount, null, false,
                "discount", null, amount + "원", "2026-08-01T10:00:00+09:00", "path.jpg",
                null, null, tiers, null, expiresAt, null, null, false);
    }

    @Test
    void keepsOfferWhenOnlySomeTiersExpired() {
        // 청년피자 땡겨요: 상시 5,000원과 하루짜리 청피데이 9,000원이 한
        // 레코드에 같이 있다. 청피데이가 끝나도 상시는 살아 있어야 한다.
        var result = serviceWith(
                List.of(recWithTiers("ddangyo", "청년피자", 9000, null,
                        List.of(tier(15000, 5000, null), tier(15000, 9000, "2026-08-05")))),
                "brands: {}", on("2026-08-06")).compare();
        assertEquals(1, result.size());
        Offer offer = result.get(0).offers().get(0);
        assertEquals(1, offer.tiers().size(), "만료된 구간은 상세에서 빠진다");
        assertEquals(5000, offer.tiers().get(0).amount());
        assertEquals(5000, offer.amount(), "대표 금액도 남은 구간에 맞춰 내려간다");
    }

    @Test
    void dropsOfferWhenEveryTierExpired() {
        var result = serviceWith(
                List.of(recWithTiers("ddangyo", "청년피자", 9000, null,
                        List.of(tier(15000, 5000, "2026-08-04"), tier(15000, 9000, "2026-08-05")))),
                "brands: {}", on("2026-08-06")).compare();
        assertTrue(result.isEmpty());
    }

    @Test
    void tierWithoutOwnExpiryFollowsRecordExpiry() {
        // 구간별 종료일은 "이 구간만 따로 끝날 때" 채운다. 비어 있으면
        // 쿠폰 전체와 같은 날 끝난다는 뜻이다.
        var result = serviceWith(
                List.of(recWithTiers("ddangyo", "브랜드", 9000, "2026-08-05",
                        List.of(tier(15000, 5000, null), tier(15000, 9000, null)))),
                "brands: {}", on("2026-08-06")).compare();
        assertTrue(result.isEmpty());
    }

    @Test
    void tierOutlivingRecordKeepsOfferAlive() {
        // 레코드 종료일이 지나도 그보다 늦게 끝나는 구간이 있으면 오퍼는 산다.
        var result = serviceWith(
                List.of(recWithTiers("ddangyo", "브랜드", 9000, "2026-08-05",
                        List.of(tier(15000, 5000, "2026-09-30"), tier(15000, 9000, null)))),
                "brands: {}", on("2026-08-06")).compare();
        assertEquals(1, result.size());
        assertEquals(1, result.get(0).offers().get(0).tiers().size());
        assertEquals(5000, result.get(0).offers().get(0).amount());
    }

    @Test
    void expiredTierLowersBrandMaxAmountAndSortOrder() {
        var result = serviceWith(
                List.of(recWithTiers("ddangyo", "구간만료", 9000, null,
                                List.of(tier(15000, 5000, null), tier(15000, 9000, "2026-08-05"))),
                        rec("baemin", "그냥7000", 7000, null, false)),
                "brands: {}", on("2026-08-06")).compare();
        assertEquals("그냥7000", result.get(0).name(), "9,000이 5,000으로 내려가 순서가 바뀐다");
        assertEquals(5000, result.get(1).maxConfirmedAmount());
    }

    @Test
    void keepsRepresentativeAmountWhenSurvivingTierIsLarger() {
        // 배민 도미노피자 픽스처: 일반 4,000원(12-30)과 멤버십 7,500원(12-31)이
        // 구간으로 함께 있고 대표값은 일반가 4,000원이다. 일반 구간이 끝나 남은
        // 게 멤버십 7,500원뿐이어도 대표값을 그리로 올리면 안 된다 — 멤버십
        // 조건은 구간에 실려 있지 않아 API가 판단할 수 없다.
        var result = serviceWith(
                List.of(recWithTiers("baemin", "도미노피자", 4000, "2026-12-31",
                        List.of(tier(18900, 4000, "2026-12-30"), tier(null, 7500, "2026-12-31")))),
                "brands: {}", on("2026-12-31")).compare();
        Offer offer = result.get(0).offers().get(0);
        assertEquals(1, offer.tiers().size());
        assertEquals(7500, offer.tiers().get(0).amount());
        assertEquals(4000, offer.amount(), "남은 구간이 더 커도 대표값은 올리지 않는다");
    }

    @Test
    void soldOutTierNeverBecomesRepresentativeAmount() {
        // 쿠팡이츠 메가MGC커피 실측(2026-08-03): 20,000원 구간이 품절이라
        // 원장이 대표값을 6,000원으로 넣었다. 만료 계산이 이걸 되돌리면 안 된다.
        var result = serviceWith(
                List.of(recWithTiers("coupangeats", "메가MGC커피", 6000, null,
                        List.of(soldOutTier(16000, 20000), tier(16000, 6000, null),
                                tier(16000, 3000, null)))),
                "brands: {}", on("2026-08-06")).compare();
        assertEquals(6000, result.get(0).offers().get(0).amount());
        assertEquals(3, result.get(0).offers().get(0).tiers().size(), "품절 구간은 만료가 아니라 그대로 있다");
    }

    private static final String BANNER_YAML = """
            banners:
              - id: goobne-20260817
                brand: goobne
                platform: yogiyo
                url: https://example.test/a
                amount: "6,500원(4,000+10%)"
                period: 매일 오후 3시부터 선착순
                extra: "25,000원↑, 선착순"
                minOrder: 25000
                startsOn: 2026-08-17
                endsOn: 2026-08-23
              - id: allapps-20260817
                platform: baemin
                url: https://example.test/b
                amount: "첫 주문 5,000원"
                period: 상시
                startsOn: 2026-08-17
                endsOn: 2026-08-23
              - id: rate-20260817
                brand: BBQ
                platform: baemin
                url: https://example.test/c
                amount: "최대 30%"
                period: 상시
                startsOn: 2026-08-17
                endsOn: 2026-08-23
            """;

    @Test
    void putsTodaysBannerOnTheBrandCardAsAnOffer() {
        // 배너에 올린 순간 그 브랜드 카드에도 떠야 한다 — 실제로 받을 수
        // 있는 할인인데 원장(캡처)에는 안 잡힌다.
        String brands = """
                brands:
                  굽네치킨:
                    category: chicken
                    aliases: [goobne]
                """;
        BrandComparison card = serviceWith(List.of(), brands, on("2026-08-20"), BANNER_YAML)
                .compare().stream()
                .filter(c -> c.brand().name().equals("굽네치킨"))
                .findFirst().orElseThrow();

        Offer offer = card.offers().get(0);
        assertEquals(6500, offer.amount());
        // "6,500원(4,000+10%)"는 쿠폰 두 장을 겹친 값이라 "행사"가 아니라
        // "최적"이다(ADR-019) — 상세의 사다리와 칩의 배지가 같은 말을 해야 한다.
        assertEquals("최적", offer.qualifier());
        assertEquals("cumulative", offer.tierMode());
        assertEquals(2, offer.tiers().size());
        assertEquals("2026-08-23", offer.expiresAt());
        // 적어둔 최소주문금액이 조건으로 함께 들어가야 상세가 "미확인"으로
        // 남지 않는다.
        assertEquals(25000, offer.minOrderAmount());
        // 기간 문구가 사라지면 아무 때나 받는 할인으로 읽힌다.
        assertEquals("매일 오후 3시부터 선착순", offer.badge());
    }

    @Test
    void bannerOfferCarriesItsOwnLinkAndLeavesBrandLinksAlone() {
        // 배너의 url은 그 행사로 가는 딜링크다. 배너에서 세운 오퍼가
        // 그걸 안 들고 가면, 화면엔 배너에서 온 금액이 찍히는데 누르면
        // 브랜드 일반 링크로 간다 — 금액과 가는 곳이 어긋난다.
        String brands = """
                brands:
                  굽네치킨:
                    category: chicken
                    aliases: [goobne]
                    links:
                      yogiyo: https://example.test/brand-yogiyo
                """;
        BrandComparison card = serviceWith(List.of(), brands, on("2026-08-20"), BANNER_YAML)
                .compare().stream()
                .filter(c -> c.brand().name().equals("굽네치킨"))
                .findFirst().orElseThrow();

        assertEquals("https://example.test/a", card.offers().get(0).link());
        // 브랜드 링크는 그대로다. 배너가 끝나도 남아 있어야 하고,
        // 배너와 무관한 다른 오퍼 칩까지 행사로 끌려가면 안 된다.
        assertEquals("https://example.test/brand-yogiyo", card.links().get("yogiyo"));
    }

    @Test
    void bannerDoesNotHandItsLinkToTheOfferItBeats() {
        // 배너가 같은 앱의 원장 오퍼를 이기면 하나만 남는다. 그때
        // 이긴 쪽(배너)의 링크만 가지 미끌리면 된다 — 진 쪽 링크를
        // 끌어오면 배너 금액에 엉뚝한 행사가 붙는다.
        String brands = """
                brands:
                  굽네치킨:
                    category: chicken
                    aliases: [goobne]
                """;
        OfferRecord older = rec("yogiyo", "굽네치킨", 3000, null, false);
        BrandComparison card = serviceWith(List.of(older), brands, on("2026-08-20"), BANNER_YAML)
                .compare().stream()
                .filter(c -> c.brand().name().equals("굽네치킨"))
                .findFirst().orElseThrow();

        Offer offer = card.offers().get(0);
        assertEquals(6500, offer.amount());
        assertEquals("https://example.test/a", offer.link());
    }

    @Test
    void dropsBannersThatCannotStandAsAnOffer() {
        // 브랜드가 없는 배너(앱 전체 행사)는 붙을 카드가 없고, 정액이 아닌
        // 금액("최대 30%")은 다른 오퍼와 견줄 수가 없다.
        String brands = """
                brands:
                  BBQ:
                    category: chicken
                """;
        List<String> withEventOffer =
                serviceWith(List.of(), brands, on("2026-08-20"), BANNER_YAML).compare().stream()
                        // 배너에서 온 오퍼는 "행사", 그중 복합쿠폰은 "최적"이다.
                        .filter(c -> c.offers().stream().anyMatch(
                                o -> "행사".equals(o.qualifier()) || "최적".equals(o.qualifier())))
                        .map(c -> c.brand().name())
                        .toList();

        // 셋 중 정액에 브랜드까지 있는 배너 하나만 남는다.
        assertEquals(List.of("goobne"), withEventOffer);
    }

    @Test
    void dropsBannersOnceTheirPeriodHasPassed() {
        // 기간이 지나면 알아서 빠져야 한다 — 손으로 지우게 하면 지난 행사가
        // 계속 카드에 남는다.
        String brands = """
                brands:
                  굽네치킨:
                    category: chicken
                    aliases: [goobne]
                """;
        assertEquals(List.of(),
                serviceWith(List.of(), brands, on("2026-08-24"), BANNER_YAML).compare());
    }

    @Test
    void countsEventAndBestCombinationOffersTowardTheBestDiscount() {
        // "최대"만 뺀다 — 그건 최소주문금액을 채워야 나오는 상한액이라
        // 얼마를 받는지가 아직 안 정해졌다. "행사"와 "최적"은 조건이 붙을
        // 뿐 액수 자체는 확정이다.
        String brands = """
                brands:
                  굽네치킨:
                    category: chicken
                    aliases: [goobne]
                """;
        BrandComparison card = serviceWith(List.of(), brands, on("2026-08-20"), BANNER_YAML)
                .compare().stream()
                .filter(c -> c.brand().name().equals("굽네치킨"))
                .findFirst().orElseThrow();

        assertEquals(6500, card.maxConfirmedAmount());
    }
}
