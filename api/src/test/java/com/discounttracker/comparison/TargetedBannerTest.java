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

    /** 구조 칸을 쓰는 새 모양이다 - 문장을 다시 읽지 않는다(Task 8). extraYaml이 amount도 적는다. */
    private Offer offerWith(String extraYaml) {
        String bannerYaml = """
                banners:
                - id: baemin-targetdeal-20260912
                  brand: bhc
                  platform: baemin
                  url: https://baemin.go.link/5H0ry
                  startsOn: 2026-09-12
                  endsOn: 2026-09-12
                  priority: 1
                  %s
                """.formatted(extraYaml);
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
        assertEquals("최대", offerWith("amount: {won: 8000}\n  targeted: true").qualifier(),
                "화면에 '불확정'으로 뜬다");
    }

    @Test
    void randomCouponBannerIsMarkedRandomNotMax() {
        // 2026-09-18: bhc "최대 7,000원 / 매일 랜덤쿠폰 뽑기" 배너. 뽑기 쿠폰은 "랜덤"이다 —
        // 카드에 오르되 배지가 다르고 정렬 포함 여부는 사용자가 고른다. 표식은 구조 필드
        // (amount.random)에서 나온다 - 문구에 "랜덤"이 없어도 선다(Task 8).
        assertEquals("랜덤", offerWith("amount: {won: [3000, 7000], random: true}").qualifier());
    }

    @Test
    void targetedDealSaysItIsLimited() {
        Offer offer = offerWith("amount: {won: 8000}\n  targeted: true");

        assertNotNull(offer.conditions());
        assertTrue(offer.conditions().contains("한정"), offer.conditions());
    }

    @Test
    void anOrdinaryEventKeepsItsConfirmedMark() {
        // 확정 오퍼는 이제 "행사" 표식이 없다 - 배너 출처는 Offer.fromBanner가 이미 답하는
        // 사실이라 qualifier가 그 말을 중복해서 실을 필요가 없다(Task 8).
        Offer offer = offerWith("amount: {won: 8000}\n  firstCome: use");

        assertNull(offer.qualifier());
        assertTrue(offer.fromBanner());
        assertFalse(String.valueOf(offer.conditions()).contains("한정"),
                String.valueOf(offer.conditions()));
    }
}
