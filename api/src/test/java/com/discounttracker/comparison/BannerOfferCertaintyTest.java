package com.discounttracker.comparison;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.brand.BrandCatalog;
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
    }

    @Test
    void warnsWhenBannerAndLedgerDisagreeOnCertaintyForTheSameBrandAndPlatform() {
        // 설계 요구사항(브리프엔 없음, Task 8 컨텍스트가 명시): 같은 (브랜드, 앱)에 배너 오퍼와
        // 원장 오퍼가 겹쳤는데 확실성이 다르면 조용히 하나를 택하지 말고 경고를 남긴다.
        OfferRecord ledger = new OfferRecord("coupangeats", "bhc", 5000, "최대", false,
                "discount", null, "5,000원", "2026-09-22T09:00:00+09:00", null,
                null, null, null, null, null, null, null, null, false);
        OfferRepository repo = new OfferRepository(null) {
            @Override public void reload() { }
            @Override public List<OfferRecord> findAll() { return List.of(ledger); }
        };
        BannerCatalog banners = new BannerCatalog(new ByteArrayResource("""
                banners:
                  - id: bhc-exact-20260922
                    brand: bhc
                    platform: coupangeats
                    url: "https://example.test/e"
                    amount: {won: 5000}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                """.getBytes(StandardCharsets.UTF_8)), CLOCK, emptyBrands());
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

        assertTrue(appender.list.stream().anyMatch(
                e -> e.getLevel() == Level.WARN && e.getFormattedMessage().contains("bhc")),
                "배너(EXACT)와 원장(CAPPED)의 확실성이 다르면 경고 로그가 남아야 한다");
    }
}
