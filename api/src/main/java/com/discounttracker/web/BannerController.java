package com.discounttracker.web;

import com.discounttracker.banner.Banner;
import com.discounttracker.banner.BannerCatalog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 오늘 띄울 배너 목록.
 *
 * <p>{@code /api/brands}에 얹지 않고 따로 뒀다 — 응답 타입을 객체로 감싸는
 * 파괴적 변경을 피하고, 배너 없는 날에 빈 필드가 따라다니지 않게 한다.
 */
@RestController
@RequestMapping("/api")
public class BannerController {

    private final BannerCatalog banners;

    public BannerController(BannerCatalog banners) {
        this.banners = banners;
    }

    @GetMapping("/banners")
    public List<Banner> banners() {
        return banners.active();
    }
}
