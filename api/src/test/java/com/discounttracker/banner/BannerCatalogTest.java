package com.discounttracker.banner;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class BannerCatalogTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private static final String YAML = """
        banners:
          - id: kyochon-20260811
            brand: 교촌치킨
            platform: baemin
            url: https://s.baemin.com/kyochon
            amount: "12,000원"
            period: 8/11 하루만
            extra: 최소주문 20,000원, 선착순 300명
            color: "#c8102e"
            startsOn: 2026-08-11
            endsOn: 2026-08-11
            priority: 1
          - id: ddangyo-first-order
            platform: ddangyo
            url: https://ddangyo.example/first
            amount: 첫 주문 5,000원
            period: 8월 내내
            startsOn: 2026-08-01
            endsOn: 2026-08-31
          - id: 지난주-행사
            platform: yogiyo
            url: https://yogiyo.example/last-week
            amount: "3,000원"
            period: 지난주
            startsOn: 2026-08-01
            endsOn: 2026-08-07
        """;

    /** 한국 날짜 기준 그날 09:00. UTC로 떠 있어도 같은 날이 나오는지까지 본다. */
    private BannerCatalog catalogOn(String yaml, String isoDate) {
        Clock clock = Clock.fixed(Instant.parse(isoDate + "T00:00:00Z"), SEOUL);
        return new BannerCatalog(new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)), clock);
    }

    @Test
    void dropsBannersOutsideTheirPeriod() {
        List<Banner> active = catalogOn(YAML, "2026-08-11").active();
        assertEquals(List.of("kyochon-20260811", "ddangyo-first-order"),
                active.stream().map(Banner::id).toList());
    }

    @Test
    void includesBothBoundaryDays() {
        // 하루짜리 행사가 그날 안 뜨면 배너 기능 자체가 무의미하다.
        assertEquals(List.of("kyochon-20260811"), catalogOn(YAML, "2026-08-11").active().stream()
                .map(Banner::id).filter(id -> id.startsWith("kyochon")).toList());
        // 시작일과 종료일 자신도 포함이다.
        assertTrue(catalogOn(YAML, "2026-08-01").active().stream()
                .anyMatch(b -> b.id().equals("지난주-행사")));
        assertTrue(catalogOn(YAML, "2026-08-31").active().stream()
                .anyMatch(b -> b.id().equals("ddangyo-first-order")));
        assertTrue(catalogOn(YAML, "2026-09-01").active().isEmpty());
    }

    @Test
    void sortsByPriorityThenNearestEndDate() {
        String yaml = """
            banners:
              - id: 나중
                platform: baemin
                url: https://example.test/1
                amount: "1,000원"
                period: 이번 달
                startsOn: 2026-08-01
                endsOn: 2026-08-31
              - id: 먼저-끝남
                platform: yogiyo
                url: https://example.test/2
                amount: "2,000원"
                period: 오늘
                startsOn: 2026-08-01
                endsOn: 2026-08-11
              - id: 우선순위-높음
                platform: ddangyo
                url: https://example.test/3
                amount: "3,000원"
                period: 이번 주
                startsOn: 2026-08-01
                endsOn: 2026-08-20
                priority: 1
            """;
        assertEquals(List.of("우선순위-높음", "먼저-끝남", "나중"),
                catalogOn(yaml, "2026-08-11").active().stream().map(Banner::id).toList());
    }

    @Test
    void optionalFieldsAreNull() {
        Banner appWide = catalogOn(YAML, "2026-08-11").active().stream()
                .filter(b -> b.id().equals("ddangyo-first-order"))
                .findFirst().orElseThrow();
        assertNull(appWide.brand());
        assertNull(appWide.extra());
        assertNull(appWide.color());
        assertEquals(Banner.DEFAULT_PRIORITY, appWide.priority());
        // 금액은 정수가 아니라 적은 그대로의 문자열이다.
        assertEquals("첫 주문 5,000원", appWide.amount());
    }

    @Test
    void requiredFieldsPresentAreKept() {
        Banner b = catalogOn(YAML, "2026-08-11").active().get(0);
        assertEquals("교촌치킨", b.brand());
        assertEquals("baemin", b.platform());
        assertEquals("https://s.baemin.com/kyochon", b.url());
        assertEquals("12,000원", b.amount());
        assertEquals("8/11 하루만", b.period());
        assertEquals("최소주문 20,000원, 선착순 300명", b.extra());
        assertEquals("#c8102e", b.color());
    }

    @Test
    void entryMissingRequiredFieldIsSkippedWithoutKillingTheRest() {
        // 손으로 고치는 파일이라 오타 하나로 나머지까지 죽으면 안 된다.
        String yaml = """
            banners:
              - id: url-없음
                platform: baemin
                amount: "1,000원"
                period: 오늘
                startsOn: 2026-08-11
                endsOn: 2026-08-11
              - id: 멀쩡함
                platform: baemin
                url: https://example.test/ok
                amount: "2,000원"
                period: 오늘
                startsOn: 2026-08-11
                endsOn: 2026-08-11
            """;
        assertEquals(List.of("멀쩡함"),
                catalogOn(yaml, "2026-08-11").active().stream().map(Banner::id).toList());
    }

    @Test
    void quotedDateReadsTheSameAsBareDate() {
        // snakeyaml은 따옴표 없는 날짜를 Date로, 따옴표 붙은 것은 String으로 준다.
        String yaml = """
            banners:
              - id: 따옴표
                platform: baemin
                url: https://example.test/q
                amount: "1,000원"
                period: 오늘
                startsOn: "2026-08-11"
                endsOn: "2026-08-11"
            """;
        assertEquals(1, catalogOn(yaml, "2026-08-11").active().size());
        assertTrue(catalogOn(yaml, "2026-08-12").active().isEmpty());
    }

    @Test
    void emptyOrMissingFileIsHarmless() {
        assertTrue(catalogOn("", "2026-08-11").active().isEmpty());
        assertTrue(catalogOn("banners: []", "2026-08-11").active().isEmpty());
    }
}
