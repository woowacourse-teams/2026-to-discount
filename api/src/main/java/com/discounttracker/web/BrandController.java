package com.discounttracker.web;

import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.comparison.BrandComparison;
import com.discounttracker.comparison.BrandComparisonService;
import com.discounttracker.offer.OfferRepository;
import com.discounttracker.push.BannerNotificationService;
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
    private final com.discounttracker.analytics.PopularityIndex popularity;
    private final BannerNotificationService notifications;

    public BrandController(BrandComparisonService service, OfferRepository offers,
                           BannerCatalog banners, com.discounttracker.analytics.PopularityIndex popularity,
                           BannerNotificationService notifications) {
        this.service = service;
        this.offers = offers;
        this.banners = banners;
        this.popularity = popularity;
        this.notifications = notifications;
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
        popularity.reload();
        // 배너 파일이 깨져도 200을 돌려준다 — 오퍼는 멀쩡히 다시 읽혔고,
        // 배너는 부가 정보다. 대신 깨졌다는 사실을 응답에 실어 보낸다.
        // 건수만 보고 판단하게 두면 "이전 목록 그대로"와 "새 배너가 마침
        // 한 건"이 구분되지 않는다.
        boolean parsed = banners.reload();
        // 카탈로그에 없는 브랜드는 로고를 못 찾고 기존 브랜드 카드와도 안
        // 합쳐진다. 여태 이 목록을 응답에 싣기만 하고 bannersOk는 "YAML이
        // 읽혔나"만 봤다 — **알리면서 통과시켰다.**
        //
        // 2026-09-11~12에 세 번 통과했다: 제목과 내용이 다른 행사, 이름에
        // 낀 &amp;, 그리고 메뉴 행사가 브랜드로 등록된 것. 셋 다 화면에
        // 나간 뒤에 사람이 눈으로 찾았다. 초록불이 확인을 멈추게 한다.
        List<String> unknown = banners.unknownBrands();
        // 필수 필드가 빠진 항목도 같은 부류다 — 2026-09-18 platform 없는 배너.
        List<String> dropped = banners.dropped();
        // id가 겹치면 "이 id의 배너"가 파일 순서로 정해진다. 콘솔로 올릴 때는 막지만
        // 파일을 손으로 고치면 그 검사를 지나간다 - 여기서 한 번 더 막는다(2026-09-24).
        List<String> duplicateIds = banners.duplicateIds();
        // 옛 칸과 새 칸을 같이 적은 배너. 여태 안에서만 알고 응답에 안 실렸다.
        // 통과는 시키되 알린다 - 이행기에는 섞인 배너가 정상으로 남는다.
        List<String> mixed = banners.mixedShape();
        boolean bannersOk = parsed && unknown.isEmpty() && dropped.isEmpty() && duplicateIds.isEmpty();
        BannerNotificationService.ReloadResult push = bannersOk
                ? notifications.onReload(banners.all())
                : new BannerNotificationService.ReloadResult(0, 0, false, 0);
        return Map.ofEntries(
                Map.entry("reloaded", offers.findAll().size()),
                Map.entry("banners", banners.active().size()),
                Map.entry("bannersOk", bannersOk),
                Map.entry("bannersParsed", parsed),
                Map.entry("unknownBrands", unknown),
                Map.entry("dropped", dropped),
                Map.entry("duplicateIds", duplicateIds),
                Map.entry("mixedShape", mixed),
                Map.entry("pushActivated", push.activated()),
                Map.entry("pushImmediateRequested", push.immediateRequested()),
                Map.entry("pushImmediateAllowed", push.immediateAllowed()),
                Map.entry("pushImmediateSent", push.immediateSent()));
    }
}
