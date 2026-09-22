package com.discounttracker.banner;

import com.discounttracker.brand.BrandCatalog;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** group으로 묶으면 화면에는 한 장, 오퍼로는 구성원마다 하나. */
class BannerGroupTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    // BrandCatalog는 no-arg 생성자가 없다(Resource 필수) — 다른 배너 테스트들과
    // 같은 패턴으로 빈 리소스를 물린다. 실제로 새 별칭이 필요 없는 테스트다.
    private static BannerCatalog catalog(String yml) {
        Clock clock = Clock.fixed(Instant.parse("2026-09-22T12:00:00Z"), SEOUL);
        BrandCatalog brands = new BrandCatalog(new ByteArrayResource(new byte[0]));
        return new BannerCatalog(new ByteArrayResource(yml.getBytes(StandardCharsets.UTF_8)),
                clock, brands);
    }

    private static final String TWO_IN_A_GROUP = """
            banners:
              - id: dunkin-20260922
                group: ddangyo-doubleday-0922
                brand: 던킨
                platform: ddangyo
                url: "https://example.test/dunkin"
                amount: {won: 7000}
                minOrder: 15000
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 5
              - id: albolo-20260922
                group: ddangyo-doubleday-0922
                brand: 피자알볼로
                platform: ddangyo
                url: "https://example.test/albolo"
                amount: {won: 8000}
                minOrder: 18000
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 2
            """;

    @Test
    void groupDrawsAsOneCard() {
        List<Banner> active = catalog(TWO_IN_A_GROUP).active();
        assertEquals(1, active.size(), "묶음은 한 장이다");
        assertEquals(List.of("피자알볼로", "던킨"), active.get(0).brands(),
                "priority가 작은 구성원이 대표이고 그 순서로 늘어선다");
    }

    @Test
    void groupPriorityIsTheSmallestMemberPriority() {
        // 사람에게 두 줄에 같은 숫자를 적게 하지 않는다. 한 줄만 고치는 실수가 나고
        // 그 실수는 화면을 봐도 안 보인다.
        assertEquals(2, catalog(TWO_IN_A_GROUP).active().get(0).priority());
    }

    @Test
    void everyMemberStillBecomesItsOwnOffer() {
        List<Banner> members = catalog(TWO_IN_A_GROUP).activeMembers();
        assertEquals(2, members.size());
        assertEquals(List.of("피자알볼로", "던킨"), members.stream().map(Banner::brand).toList());
        assertEquals(18000, members.get(0).minOrder());
        assertEquals(15000, members.get(1).minOrder());
    }

    @Test
    void oldShapeStillLoads() {
        // 1단계에서는 파일을 안 건드린다. 옛 모양이 그대로 떠야 한다.
        BannerCatalog c = catalog("""
                banners:
                  - id: kyochon-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/k"
                    amount: "12,000원"
                    period: 9월 22일 하루
                    extra: "20,000원↑, 선착순 300명"
                    minOrder: 20000
                    startsOn: 2026-09-22
                    endsOn: 2026-09-22
                """);
        assertEquals(1, c.active().size());
        assertEquals("12,000원", c.active().get(0).amount());
        assertEquals("9월 22일 하루", c.active().get(0).period());
    }

    @Test
    void mixingBothShapesIsReportedRatherThanGuessed() {
        // 드리프트 2. 둘 다 있으면 어느 쪽이 이기는지 파일만 봐서는 모른다.
        BannerCatalog c = catalog("""
                banners:
                  - id: mixed-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/m"
                    amount: "12,000원"
                    startsOn: 2026-09-22
                    startsAt: 2026-09-22T17:00
                    endsOn: 2026-09-22
                """);
        assertEquals(List.of("mixed-20260922"), c.mixedShape());
    }

    private static final String CROSSED_PRIORITY_AND_ID = """
            banners:
              - id: zzz-20260922
                group: crossed-0922
                brand: 지브랜드
                platform: ddangyo
                url: "https://example.test/zzz"
                amount: {won: 1111}
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 1
              - id: aaa-20260922
                group: crossed-0922
                brand: 에이브랜드
                platform: ddangyo
                url: "https://example.test/aaa"
                amount: {won: 2222}
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 9
            """;

    @Test
    void representativeIsChosenByOriginalPriorityNotById() {
        // 반례: id는 aaa가 zzz보다 앞서지만(알파벳 순) priority는 zzz가 더 작다.
        // activeMembers()가 그룹 구성원의 priority를 그룹 최솟값(1)으로 덮어써
        // 두 구성원이 동률이 되므로, 대표를 고를 때 그 전의 원래 값을 안 보면
        // id가 앞선 aaa가 대표가 되어 버린다 - url과 amount로 zzz가 이겼는지 본다.
        Banner card = catalog(CROSSED_PRIORITY_AND_ID).active().get(0);
        assertEquals("https://example.test/zzz", card.url());
        assertEquals("1,111원", card.amount());
    }

    @Test
    void tiedOriginalPriorityFallsBackToIdRegardlessOfFileOrder() {
        // priority가 진짜로 같으면(3, 3) endsAt도 같아 id로 가른다 - 그 결과가
        // 파일에 적은 순서에 기대면 안 된다.
        String memberA = """
                  - id: id-a-20260922
                    group: tied-0922
                    brand: 브랜드A
                    platform: ddangyo
                    url: "https://example.test/a"
                    amount: {won: 3000}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                    priority: 3
                """;
        String memberB = """
                  - id: id-b-20260922
                    group: tied-0922
                    brand: 브랜드B
                    platform: ddangyo
                    url: "https://example.test/b"
                    amount: {won: 4000}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                    priority: 3
                """;
        Banner aFirstInFile = catalog("banners:\n" + memberA + memberB).active().get(0);
        Banner bFirstInFile = catalog("banners:\n" + memberB + memberA).active().get(0);
        assertEquals("https://example.test/a", aFirstInFile.url(), "id-a가 id-b보다 앞선다");
        assertEquals(aFirstInFile.url(), bFirstInFile.url(), "파일 순서를 바꿔도 대표는 같다");
    }

    @Test
    void seventeenOclockBannerIsHiddenBeforeItOpens() {
        // 고정 시계는 2026-09-22 21:00 KST(12:00Z)다. 22시 오픈 배너는 아직 안 뜬다.
        BannerCatalog c = catalog("""
                banners:
                  - id: late-20260922
                    brand: 교촌치킨
                    platform: baemin
                    url: "https://example.test/l"
                    amount: {won: 5000}
                    startsAt: 2026-09-22T22:00
                    endsAt: 2026-09-22T23:59
                """);
        assertEquals(List.of(), c.active());
    }
}
