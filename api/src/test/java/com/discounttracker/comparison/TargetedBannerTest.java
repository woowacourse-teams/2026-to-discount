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

import static org.junit.jupiter.api.Assertions.*;

/**
 * 타겟딜은 확정 금액으로 서면 안 된다.
 *
 * <p>2026-09-12 실측: 배짱할인 웰컴 핫딜의 bhc / 홍콩반점0410 8,000원 두 장이
 * 계정에 따라 번갈아 떴다. 그 금액이 "행사"로 굳으면 확정 최고액이 되어
 * 카드 대표값과 "최고 할인"까지 그 값으로 가는데, 보고 온 사람 절반은
 * 화면과 다른 앱을 만난다. 상한과 같은 성질이라 같은 표식을 쓴다.
 */
class TargetedBannerTest {

    private static final Clock TODAY =
            Clock.fixed(Instant.parse("2026-09-12T03:00:00Z"), ZoneId.of("Asia/Seoul"));

    private Offer offerWith(String extra) {
        String bannerYaml = """
                banners:
                - id: baemin-targetdeal-20260912
                  brand: bhc
                  platform: baemin
                  url: https://baemin.go.link/5H0ry
                  amount: BHC·홍콩반점 8,000원
                  period: 타겟딜
                  extra: "%s"
                  startsOn: 2026-09-12
                  endsOn: 2026-09-12
                  priority: 1
                """.formatted(extra);
        BrandCatalog brands = new BrandCatalog(
                new ByteArrayResource("brands: {}".getBytes(StandardCharsets.UTF_8)));
        BannerCatalog banners = new BannerCatalog(
                new ByteArrayResource(bannerYaml.getBytes(StandardCharsets.UTF_8)), TODAY, brands);
        OfferRepository repo = new OfferRepository(null) {
            @Override public void reload() { }
            @Override public List<OfferRecord> findAll() { return List.of(); }
        };
        return new BrandComparisonService(repo, brands, banners, TODAY)
                .compare().get(0).offers().get(0);
    }

    @Test
    void targetedDealIsNotAConfirmedAmount() {
        assertEquals("최대", offerWith("고객별 타겟딜, 앱에서 확인").qualifier(),
                "화면에 '불확정'으로 뜬다");
    }

    @Test
    void targetedDealSaysItIsLimited() {
        Offer offer = offerWith("고객별 타겟딜, 앱에서 확인");

        assertNotNull(offer.conditions());
        assertTrue(offer.conditions().contains("한정"), offer.conditions());
    }

    @Test
    void anOrdinaryEventKeepsItsConfirmedMark() {
        // 행사는 그 기간 누구나 받는 것이라 "한정"이 거짓이 된다.
        Offer offer = offerWith("18,000원↑, 사용(발급X) 선착순");

        assertEquals("행사", offer.qualifier());
        assertFalse(String.valueOf(offer.conditions()).contains("한정"),
                String.valueOf(offer.conditions()));
    }
}
