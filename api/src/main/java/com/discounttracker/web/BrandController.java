package com.discounttracker.web;

import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.comparison.BrandComparison;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.OfferRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class BrandController {

    private final BrandComparisonService service;
    private final OfferRepository offers;
    private final BannerCatalog banners;

    public BrandController(BrandComparisonService service, OfferRepository offers,
                           BannerCatalog banners) {
        this.service = service;
        this.offers = offers;
        this.banners = banners;
    }

    @GetMapping("/brands")
    public List<BrandComparison> brands() {
        return service.compare();
    }

    /**
     * 재배포 없이 파일만 갈아끼웠을 때 부른다 — 원장(export.json)과
     * 배너(banners.yml) 둘 다 다시 읽는다. 배너 파일 경로를 jar 밖으로
     * 열어둔 의미가 여기 있다.
     *
     * <p>{@code banners}는 오늘 띄울 건수다 — 기간 밖인 것과 필수 값이 빠져
     * 건너뛴 것은 안 세므로, 방금 적은 배너가 여기 안 잡히면 날짜나 오타를
     * 의심하면 된다.
     */
    @PostMapping("/reload")
    public Map<String, Object> reload() {
        offers.reload();
        // 배너 파일이 깨져도 200을 돌려준다 — 오퍼는 멀쩡히 다시 읽혔고,
        // 배너는 부가 정보다. 대신 깨졌다는 사실을 응답에 실어 보낸다.
        // 건수만 보고 판단하게 두면 "이전 목록 그대로"와 "새 배너가 마침
        // 한 건"이 구분되지 않는다.
        boolean bannersOk = banners.reload();
        return Map.of(
                "reloaded", offers.findAll().size(),
                "banners", banners.active().size(),
                "bannersOk", bannersOk,
                // 비어 있어야 정상이다. 이름이 있으면 그 배너는 로고를 못 찾고
                // 기존 브랜드 카드와도 안 합쳐진다 — brands.yml에 별칭 한 줄.
                "unknownBrands", banners.unknownBrands());
    }
}
