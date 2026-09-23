package com.discounttracker.comparison;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Certainty;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** 배너 칸에서 바로 표식이 나온다. 서버가 만든 문장을 서버가 다시 읽지 않는다. */
class BannerOfferCertaintyTest {

    private static final Clock CLOCK =
            Clock.fixed(Instant.parse("2026-09-22T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    private static BrandCatalog emptyBrands() {
        return new BrandCatalog(new ByteArrayResource("brands: {}".getBytes(StandardCharsets.UTF_8)));
    }

    // ponytail: OfferRepository·BrandCatalog는 생성자가 Resource를 요구한다(스프링 @Value 기본값은
    // DI를 거쳐야만 먹는다). 빈 원장/빈 브랜드표를 테스트에서 바로 만들 때 두 클래스가 이미 쓰는
    // 자리(null 원장, "brands: {}")를 그대로 쓴다 - 새 무인자 생성자를 만들 필요는 없다.
    private static BrandComparisonService service(String yml) {
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(yml.getBytes(StandardCharsets.UTF_8)), CLOCK, emptyBrands());
        return new BrandComparisonService(new OfferRepository(null), emptyBrands(), banners, CLOCK, "");
    }

    private static Offer only(BrandComparisonService s) {
        List<BrandComparison> cards = s.compare();
        assertEquals(1, cards.size(), "카드 하나여야 한다");
        assertEquals(1, cards.get(0).offers().size(), "오퍼 하나여야 한다");
        return cards.get(0).offers().get(0);
    }

    @Test
    void openRangeBecomesCappedWithoutReadingTheSentence() {
        Offer o = only(service("""
                banners:
                  - id: bhc-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/b"
                    amount: {won: [null, 8000]}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals(Certainty.CAPPED, o.certainty());
        assertEquals(8000, o.amount());
    }

    @Test
    void randomBeatsCapped() {
        Offer o = only(service("""
                banners:
                  - id: bhc-random-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/r"
                    amount: {won: [null, 7000], random: true}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals(Certainty.RANDOM, o.certainty());
    }

    @Test
    void targetedIsCappedBecauseHalfTheVisitorsSeeSomethingElse() {
        // 2026-09-12 실측: bhc와 홍콩반점 8,000원이 계정에 따라 번갈아 떴다.
        Offer o = only(service("""
                banners:
                  - id: bhc-target-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/t"
                    amount: {won: 8000}
                    targeted: true
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals(Certainty.CAPPED, o.certainty());
    }

    @Test
    void ownBannerNowStandsAsAnOffer() {
        // 브랜드 자체 앱이나 사이트의 행사도 그 브랜드를 보는 사람에게는 고를 수 있는 값이다.
        Offer o = only(service("""
                banners:
                  - id: baekeok-20260922
                    brand: 백억커피
                    platform: own
                    via: naverpay
                    url: "https://example.test/o"
                    amount: {percent: 50, kind: cashback}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals("own", o.platform());
        assertEquals(Certainty.PERCENT, o.certainty());
        assertEquals("https://example.test/o", o.link());
    }

    @Test
    void groupMembersEachGetTheirOwnOffer() {
        // 오퍼는 묶지 않는다. 묶음에 브랜드가 둘이면 브랜드 카드 둘에 오퍼가 하나씩 선다.
        List<BrandComparison> cards = service("""
                banners:
                  - id: dunkin-20260922
                    group: g1
                    brand: 던킨
                    platform: ddangyo
                    url: "https://example.test/d"
                    amount: {won: 7000}
                    minOrder: 15000
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                  - id: albolo-20260922
                    group: g1
                    brand: 피자알볼로
                    platform: ddangyo
                    url: "https://example.test/a"
                    amount: {won: 8000}
                    minOrder: 18000
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """).compare();
        assertEquals(2, cards.size());
        assertEquals(List.of(8000, 7000),
                cards.stream().map(c -> c.offers().get(0).amount()).toList());
        // 각 구성원이 자기 자신의 딜링크를 들고 간다 - 묶음 대표(카드 하나)의 url이
        // 아니다. 기존 assertion은 금액만 봐서 서로 링크가 뒤바뀌어도 못 잡았다.
        assertEquals(List.of("https://example.test/a", "https://example.test/d"),
                cards.stream().map(c -> c.offers().get(0).link()).toList());
    }

    @Test
    void ownBannerNeverFeedsTheBestDiscountComparison() {
        // Critical fix(2026-09-22): platform: own의 확정 정액이 maxConfirmedAmount로 새면
        // 배달앱끼리 겨루는 "최고 할인" 자리를 자사 적립·캐시백 행사가 차지한다. 실제
        // 서비스가 쓰는 길(compare())로 확인한다 - OfferComparison을 직접 부르지 않는다.
        List<BrandComparison> cards = service("""
                banners:
                  - id: baekeok-won-20260922
                    brand: 백억커피
                    platform: own
                    url: "https://example.test/o"
                    amount: {won: 5000}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """).compare();
        assertEquals(1, cards.size());
        BrandComparison card = cards.get(0);
        assertEquals(5000, card.offers().get(0).amount(), "오퍼 자체는 카드에 선다");
        assertNull(card.maxConfirmedAmount(), "own은 배달앱끼리 겨루는 최고 할인 후보가 아니다");
    }

    @Test
    void soldOutOfferNeverFeedsTheBestDiscountComparison() {
        // Fix round 3: soldOut은 own·kind와 같은 문으로 들어왔다(isBestCandidate가
        // !soldOut도 요구한다) - 확정 오퍼가 매진뿐인 브랜드는 maxConfirmedAmount가
        // null이어야 byBestDiscount()에서 안 뜬다. 매진을 안 걸면(assertEquals(5000, ...))
        // 이 테스트가 잡아낸다.
        List<BrandComparison> cards = service("""
                banners:
                  - id: bbq-soldout-20260922
                    brand: BBQ
                    platform: baemin
                    url: "https://example.test/s"
                    amount: {won: 5000}
                    soldOut: true
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """).compare();
        assertEquals(1, cards.size());
        BrandComparison card = cards.get(0);
        assertEquals(5000, card.offers().get(0).amount(), "오퍼 자체는 카드에 선다");
        assertTrue(card.offers().get(0).soldOut());
        assertNull(card.maxConfirmedAmount(), "확정 오퍼가 매진뿐이면 최고 할인 후보가 아니다");
    }

    @Test
    void ownBannerCarriesItsRealAmountKind() {
        // Offer.from이 kind를 discount로 굳히면 백억커피 네이버페이 적립(캐시백)이
        // 확정 할인으로 둔갑한다(banners.yml 예시에 있는 실제 사례).
        Offer o = only(service("""
                banners:
                  - id: baekeok-cashback-20260922
                    brand: 백억커피
                    platform: own
                    url: "https://example.test/o"
                    amount: {won: 3000, kind: cashback}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """));
        assertEquals(AmountKind.CASHBACK, o.kind());
    }

    @Test
    void deliveryAppCashbackBannerStandsButIsNeverTheBestCandidate() {
        // Fix round 2: own만 막고 kind는 안 물었던 구멍 - 배달앱(baemin)에 적립·캐시백
        // 배너를 적어도 그게 확정 "할인"인 것처럼 maxConfirmed로 새면 안 된다. own인지와
        // 무관하게 kind가 discount가 아니면 최고 할인 후보가 아니다.
        List<BrandComparison> cards = service("""
                banners:
                  - id: baemin-cashback-20260922
                    brand: bhc
                    platform: baemin
                    url: "https://example.test/c"
                    amount: {won: 3000, kind: cashback}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """).compare();
        assertEquals(1, cards.size());
        BrandComparison card = cards.get(0);
        assertEquals(3000, card.offers().get(0).amount(), "오퍼 자체는 카드에 선다");
        assertEquals(AmountKind.CASHBACK, card.offers().get(0).kind());
        assertNull(card.maxConfirmedAmount(), "캐시백은 배달앱이어도 최고 할인 후보가 아니다");
    }

    @Test
    void deliveryAppPercentBannerNeverBecomesAnOffer() {
        // Fix round 2 되돌림: amount null인 채로 서면 "금액 미확인" 칩이 뜨고, 배지에
        // 퍼센트를 적으면 App.jsx의 status-badge 자리(기간·시각 배지가 쓰는 자리)를
        // 뺏는다(2026-09-21 고정을 되돌리는 셈). 배달앱 정률 배너는 Task 8 이전처럼
        // 오퍼로 안 서는 것이 무회귀다 - own은 예외(ownBannerNowStandsAsAnOffer).
        String yaml = """
                banners:
                  - id: bbq-rate-20260922
                    brand: BBQ
                    platform: baemin
                    url: "https://example.test/r"
                    amount: {percent: 30}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """;
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)), CLOCK, emptyBrands());
        BrandComparisonService svc =
                new BrandComparisonService(new OfferRepository(null), emptyBrands(), banners, CLOCK, "");

        assertEquals(List.of(), svc.compare());
        assertEquals(1, banners.active().size(), "레일에는 여전히 뜬다");
    }

    @Test
    void oldSentenceShapeBannerStandsAsAnOfferToo() {
        // 2026-09-23 RULES 12로 뒤집혔다. Task 8이 여기서 문장 모양을 건너뛰게 했는데,
        // 라이브 배너 9장이 전부 문장 모양이라 브랜드 카드의 배너 오퍼가 통째로
        // 사라졌다(조용한 회귀 - 레일은 그대로 떴다). 이제 옛 경로로 내려가 선다.
        String yaml = """
                banners:
                  - id: oldshape-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/old"
                    amount: "8,000원"
                    period: 8/11 하루만
                    extra: "20,000원↑, 선착순 300명"
                    startsOn: 2026-09-22
                    endsOn: 2026-09-22
                """;
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)), CLOCK, emptyBrands());
        BrandComparisonService svc =
                new BrandComparisonService(new OfferRepository(null), emptyBrands(), banners, CLOCK, "");

        assertEquals(1, svc.compare().size(), "구조 칸이 없어도 문자열 금액에서 오퍼가 선다");
        assertEquals(8000, svc.compare().get(0).offers().get(0).amount());
        assertEquals(1, banners.active().size(), "레일에는 여전히 뜬다");
        assertEquals("8,000원", banners.active().get(0).amount());
    }

    private static final String BHC_EXACT_BANNER = """
            banners:
              - id: bhc-exact-20260922
                brand: bhc
                platform: coupangeats
                url: "https://example.test/e"
                amount: {won: 5000}
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
            """;

    private static OfferRecord ledgerBhc(String qualifier) {
        return new OfferRecord("coupangeats", "bhc", 5000, qualifier, false,
                "discount", null, "5,000원", "2026-09-22T09:00:00+09:00", null,
                null, null, null, null, null, null, null, null, false);
    }

    /** BrandComparisonService의 경고만 골라 문자열로 돌려준다. */
    private static List<String> warningMessages(String bannerYaml, List<OfferRecord> ledgerRecords) {
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(bannerYaml.getBytes(StandardCharsets.UTF_8)), CLOCK, emptyBrands());
        OfferRepository repo = new OfferRepository(null) {
            @Override public void reload() { }
            @Override public List<OfferRecord> findAll() { return ledgerRecords; }
        };
        BrandComparisonService service =
                new BrandComparisonService(repo, emptyBrands(), banners, CLOCK, "");

        Logger logger = (Logger) LoggerFactory.getLogger(BrandComparisonService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            service.compare();
        } finally {
            logger.detachAppender(appender);
        }
        return appender.list.stream()
                .filter(e -> e.getLevel() == Level.WARN)
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
    }

    @Test
    void warnsWhenBannerAndLedgerDisagreeOnCertaintyAndNamesTheBanner() {
        // 설계 요구사항(브리프엔 없음, Task 8 컨텍스트가 명시): 같은 (브랜드, 앱)에 배너 오퍼와
        // 원장 오퍼가 겹쳤는데 확실성이 다르면 조용히 하나를 택하지 말고 경고를 남긴다.
        // 브랜드에 배너가 여러 장일 수 있어 브랜드·플랫폼만으로는 어느 배너인지 못 찾는다 -
        // id도 실린다.
        List<String> warnings = warningMessages(BHC_EXACT_BANNER, List.of(ledgerBhc("최대")));
        assertEquals(1, warnings.size(), warnings.toString());
        assertTrue(warnings.get(0).contains("bhc-exact-20260922"), warnings.get(0));
        assertTrue(warnings.get(0).contains("bhc"), warnings.get(0));
    }

    @Test
    void noWarningWhenBannerAndLedgerAgreeOnCertainty() {
        assertEquals(List.of(), warningMessages(BHC_EXACT_BANNER, List.of(ledgerBhc(null))));
    }

    @Test
    void noWarningBetweenTwoBannersEvenIfCertaintyDiffers() {
        // 무조건 log.warn을 찍는 스텁도 통과시킬 수 있던 자리 - 배너끼리는, 원장끼리는
        // 서로 "어긋남"이 아니다. 이 축은 출처(fromBanner)가 갈릴 때만 의미가 있다.
        String yaml = """
                banners:
                  - id: bhc-exact-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/e"
                    amount: {won: 5000}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                  - id: bhc-capped-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/c"
                    amount: {won: [null, 7000]}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """;
        assertEquals(List.of(), warningMessages(yaml, List.of()));
    }

    @Test
    void noWarningBetweenTwoLedgerRecordsEvenIfCertaintyDiffers() {
        assertEquals(List.of(),
                warningMessages("banners: []", List.of(ledgerBhc(null), ledgerBhc("최대"))));
    }
}
