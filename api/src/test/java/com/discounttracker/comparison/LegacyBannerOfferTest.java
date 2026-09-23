package com.discounttracker.comparison;

import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 옛 모양 배너(문자열 {@code amount})도 오퍼로 선다(RULES 12).
 *
 * <p>2026-09-23 운영 파일 실측: 살아 있거나 앞으로 뜰 배너 9장이 전부 문자열 금액이다
 * ("9,000원", "7,000원", "7/6/6/5천원"). 구조 칸이 없으면 건너뛰던 동안 그 9장이 세우던
 * 브랜드 카드 오퍼가 통째로 사라졌고, 배너 레일은 그대로 떠서 아무도 몰랐다.
 *
 * <p>여기 적은 yml은 운영 파일에서 그대로 가져온 모양이다. 폴백을 빼면 전부 깨진다.
 */
class LegacyBannerOfferTest {

    /** 텍스트 블록에 줄바꿈을 이어 붙일 때 쓴다. */
    private static final String LF = "\n";

    private static final Clock TODAY =
            Clock.fixed(Instant.parse("2026-09-23T02:00:00Z"), ZoneId.of("Asia/Seoul"));

    private List<BrandComparison> compare(String bannerYaml) {
        BrandCatalog brands = new BrandCatalog(
                new ByteArrayResource("brands: {}".getBytes(StandardCharsets.UTF_8)));
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(bannerYaml.getBytes(StandardCharsets.UTF_8)), TODAY, brands);
        OfferRepository repo = new OfferRepository(null) {
            @Override public void reload() { }
            @Override public List<OfferRecord> findAll() { return List.of(); }
        };
        return new BrandComparisonService(repo, brands, banners, TODAY).compare();
    }

    private Map<String, Offer> byBrand(String bannerYaml) {
        return compare(bannerYaml).stream()
                .filter(c -> !c.offers().isEmpty())
                .collect(Collectors.toMap(c -> c.brand().name(), c -> c.offers().get(0)));
    }

    @Test
    void stringAmountStillStandsAsAnOffer() {
        // 청년다방 땡겨요 9,000원(운영 파일 그대로). 구조 칸이 하나도 없다.
        Map<String, Offer> offers = byBrand("""
                banners:
                - id: cheongnyeon-20260923
                  brand: 청년다방
                  platform: ddangyo
                  url: https://fdofd.ddangyo.com/gateway4.html?2BppPgs
                  amount: 9,000원
                  period: 9월 23일 하루만
                  extra: 청년다방 / 18,900원↑, 사용(발급X) 선착순
                  minOrder: 18900
                  startsOn: 2026-09-23
                  endsOn: 2026-09-23
                  firstCome: use
                """);

        Offer offer = offers.get("청년다방");
        assertNotNull(offer, "문자열 금액 배너가 오퍼로 서야 한다");
        assertEquals(9000, offer.amount());
        assertNull(offer.qualifier(), "확정 금액이다");
        assertEquals(18900, offer.minOrderAmount(), "extra 문장에서 문턱을 되짚는다");
    }

    @Test
    void slashListPairsWithBrandsInOrder() {
        // 쿠팡이츠 선착순 묶음 배너. brands 넷과 "7/6/6/5천원"을 순서로 짝짓는다.
        Map<String, Offer> offers = byBrand("""
                banners:
                - id: coupangeats-open-20260923-17시
                  platform: coupangeats
                  brands: [굽네, 자담치킨, 파파이스, 바푸리]
                  url: https://example.test/ce
                  amount: 7/6/6/5천원
                  period: 오늘 17시 선착순
                  extra: 17시~ 굽네 · 자담치킨 · 파파이스 · 바푸리 · 1인 1회
                  startsOn: 2026-09-23
                  endsOn: 2026-09-23
                  firstCome: issue
                """);

        assertEquals(7000, offers.get("굽네").amount());
        assertEquals(6000, offers.get("자담치킨").amount());
        assertEquals(6000, offers.get("파파이스").amount());
        assertEquals(5000, offers.get("바푸리").amount());
    }

    @Test
    void oldRulesDecideCertaintyOnTheLegacyPath() {
        // "최대"는 상한, limit: random은 뽑기, 타겟딜은 상한과 같은 성질이다. 나머지는 확정.
        assertEquals("최대", legacyQualifier("가게가", "  amount: 최대 8,000원"));
        assertEquals("랜덤", legacyQualifier("가게나", "  amount: 최대 7,000원", "  limit: random"));
        assertEquals("최대", legacyQualifier("가게다", "  amount: 8,000원", "  extra: 타겟딜"));
        assertNull(legacyQualifier("가게라", "  amount: 8,000원"));
    }

    /** 옛 모양 배너 한 장을 세우고 그 오퍼의 표식을 돌려준다. */
    private String legacyQualifier(String brand, String... lines) {
        String head = """
                banners:
                - id: legacy-%s
                  brand: %s
                  platform: baemin
                  url: https://example.test/b
                  startsOn: 2026-09-23
                  endsOn: 2026-09-23
                """.formatted(brand, brand);
        return byBrand(head + String.join(LF, lines) + LF).get(brand).qualifier();
    }

    @Test
    void ownCashbackBannerKeepsStandingWithItsAmount() {
        // 백억커피(운영 파일). platform이 없어 own이고, limit: cashback만 있어
        // amountSpec이 금액 없는 껍데기로 온다 - 그래도 문자열에서 10,000원이 나와야 한다.
        Offer offer = byBrand("""
                banners:
                - id: baegeok-20260921
                  brand: 백억커피
                  url: https://10billioncoffee.co.kr/community/event/54
                  amount: 최대 10,000원, 50% 적립
                  period: 9/21~10/11
                  extra: 5,000원↑ / 네이버페이 포인트차감분 제외 적립
                  minOrder: 5000
                  startsOn: 2026-09-21
                  endsOn: 2026-10-11
                  limit: cashback
                """).get("백억커피");

        assertNotNull(offer, "자사 배너도 오퍼로 선다");
        assertEquals(10000, offer.amount());
        assertEquals("최대", offer.qualifier());
        assertEquals("cashback", offer.kind().key(), "적립은 확정 할인 천장에 못 들어간다");
    }

    @Test
    void percentOnlyLegacyBannerStandsNoOffer() {
        // "최대 30%"에는 정액이 없다. 지어내지 않는다 - 배너 레일에만 남는다.
        assertTrue(compare("""
                banners:
                - id: legacy-percent-20260923
                  brand: 가게마
                  platform: baemin
                  url: https://example.test/p
                  amount: 최대 30%
                  startsOn: 2026-09-23
                  endsOn: 2026-09-23
                """).isEmpty());
    }
}
