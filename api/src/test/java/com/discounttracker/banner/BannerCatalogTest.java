package com.discounttracker.banner;

import org.junit.jupiter.api.Test;
import com.discounttracker.brand.BrandCatalog;
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

    @Test
    void startsUpEvenWhenTheFileIsUnparseable() {
        // 2026-08-21: 배너 항목 사이 콤마 하나가 빠져 이 생성자가 예외를 던졌고,
        // 스프링 컨텍스트가 못 떠 API 전체가 502였다(systemd 재시작 4회).
        // 배너는 부가 정보다 — 배너만 비고 브랜드·통계·이벤트 수집은 살아야 한다.
        String broken = """
            banners: [
              { id: a, platform: baemin, url: https://x, amount: "1원",
                period: 오늘, startsOn: 2026-08-21, endsOn: 2026-08-21 }
              { id: b, platform: baemin, url: https://y, amount: "2원",
                period: 오늘, startsOn: 2026-08-21, endsOn: 2026-08-21 }
            ]
            """;
        BannerCatalog catalog = catalogOn(broken, "2026-08-21");
        assertEquals(List.of(), catalog.active());
    }

    @Test
    void keepsPreviousBannersWhenAReloadFails() {
        // 고치려다 더 깨뜨렸을 때, 멀쩡히 떠 있던 배너까지 사라지면 안 된다.
        BannerCatalog catalog = catalogOn(YAML, "2026-08-11");
        int before = catalog.active().size();
        assertTrue(before > 0);

        catalog.reload();
        assertEquals(before, catalog.active().size());
    }

    /** 한국 날짜 기준 그날 09:00. UTC로 떠 있어도 같은 날이 나오는지까지 본다. */
    private BannerCatalog catalogOn(String yaml, String isoDate) {
        Clock clock = Clock.fixed(Instant.parse(isoDate + "T00:00:00Z"), SEOUL);
        return new BannerCatalog(new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)),
                clock, brands());
    }

    /** 별칭 하나만 있는 최소 브랜드 목록. 배너가 별칭표를 타는지만 본다. */
    private BrandCatalog brands() {
        String yaml = """
                brands:
                  굽네치킨:
                    category: chicken
                    aliases: [goobne]
                """;
        return new BrandCatalog(new ByteArrayResource(yaml.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void rewritesBannerBrandToItsCanonicalName() {
        // 프론트가 배너 브랜드명을 그대로 로고 파일명으로 쓴다 — 앱에서 복사한
        // 표기(goobne)가 그대로 나가면 로고를 못 찾고 폴백 글자만 뜬다.
        String yaml = """
                banners:
                  - id: goobne-20260817
                    brand: goobne
                    platform: yogiyo
                    url: https://example.test/a
                    amount: "6,500원"
                    period: 매일 오후 3시부터
                    startsOn: 2026-08-17
                    endsOn: 2026-08-23
                """;
        assertEquals("굽네치킨", catalogOn(yaml, "2026-08-20").active().get(0).brand());
    }

    @Test
    void leavesUnknownBrandNamesAlone() {
        // 별칭표에 없는 이름은 손대지 않는다 — 대표명을 직접 적은 배너가
        // 대부분이고, 모르는 이름을 지어내면 없는 로고를 부르게 된다.
        String yaml = """
                banners:
                  - id: bhc-20260820
                    brand: bhc
                    platform: baemin
                    url: https://example.test/b
                    amount: "8,000원"
                    period: 오후 5시부터
                    startsOn: 2026-08-20
                    endsOn: 2026-08-20
                """;
        assertEquals("bhc", catalogOn(yaml, "2026-08-20").active().get(0).brand());
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

    @Test
    void reportsWhetherTheFileCouldBeRead() {
        // 깨진 파일을 조용히 넘기면 배너를 넣은 사람은 반영된 줄 안다 —
        // 2026-08-22에 URL의 ?를 따옴표로 안 감싸 하루치 배너가 안 떴는데
        // POST /api/reload는 200에 건수까지 돌려줬다.
        String broken = """
                banners: [
                  {
                    id: a-20260822,
                    platform: ddangyo,
                    url: https://example.test/x.html?abc,
                    amount: "7,000원",
                    period: 하루만,
                    startsOn: 2026-08-22,
                    endsOn: 2026-08-22
                  }
                ]
                """;
        assertFalse(catalogOn(broken, "2026-08-22").reload());
        assertTrue(catalogOn(YAML, "2026-08-11").reload());
    }

    @Test
    void listsBannerBrandsThatBrandsYmlDoesNotKnow() {
        // 모르는 이름이면 로고를 못 찾아 폴백 글자가 뜨고 기존 브랜드
        // 카드와도 안 합쳐진다. 파일을 고친 사람이 바로 알아야 한다.
        String yaml = """
                banners:
                  - id: known-20260820
                    brand: goobne
                    platform: yogiyo
                    url: https://example.test/a
                    amount: "6,500원"
                    period: 상시
                    startsOn: 2026-08-17
                    endsOn: 2026-08-23
                  - id: unknown-20260820
                    brand: touslesjours
                    platform: baemin
                    url: https://example.test/b
                    amount: "6,000원"
                    period: 상시
                    startsOn: 2026-08-17
                    endsOn: 2026-08-23
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-08-20");
        assertEquals(List.of("touslesjours"), catalog.unknownBrands());
    }

    @Test
    void readsMinOrderOutOfTheExtraLineWhenNobodyFilledTheField() {
        // 사람은 extra에 "16,000원↑"를 적고 끝낸다. 실측(2026-08-25)에서
        // 살아 있는 배너 셋 전부가 minOrder를 비워 둔 채였고, 그 배너가
        // 카드에 설 때 조건이 전부 "최소주문 미확인"으로 떴어졌다.
        assertEquals(16000, banner("16,000원↑, 사용(발급X) 선착순", null).effectiveMinOrder());
        assertEquals(18900, banner("18,900원 이상", null).effectiveMinOrder());
        assertEquals(20000, banner("최소주문 20,000원, 선착순 300명", null).effectiveMinOrder());

        // 뒤에 따라붙는 금액은 할인액이지 최소주문금액이 아니다.
        assertEquals(25000,
                banner("25,000원↑, 고정 6,000+선착순 4,000", null).effectiveMinOrder());

        // 문구가 명시된 minOrder보다 세다. extra는 배너를 올리면서 매번
        // 다시 적는 문장이고, minOrder는 한번 적고 그대로 두는 칸이라
        // 둘이 어긋나면 문구 쪽이 지금 화면에 뜼는 값이다.
        assertEquals(16000, banner("16,000원↑", 9000).effectiveMinOrder());

        // 문구가 깨졌을 때만 적어둔 값으로 떨어진다 — 실측으로
        // "원↑, 사용(발급X) 선착순"처럼 숫자가 빠진 배너가 있었다.
        assertEquals(9000, banner("원↑, 사용(발급X) 선착순", 9000).effectiveMinOrder());

        // 금액을 말하지 않는 문구에서는 지어내지 않는다.
        assertNull(banner("선착순 300명", null).effectiveMinOrder());
        assertNull(banner("7,000원 할인", null).effectiveMinOrder());
        assertNull(banner(null, null).effectiveMinOrder());
    }

    private Banner banner(String extra, Integer minOrder) {
        return banner("7,000원", extra, minOrder);
    }

    private Banner banner(String amount, String extra, Integer minOrder) {
        return new Banner("id", "교촌치킨", "baemin", "https://example.test",
                amount, "상시", extra, minOrder, null,
                java.time.LocalDate.parse("2026-08-25"),
                java.time.LocalDate.parse("2026-08-25"), null, 1);
    }

    @Test
    void splitsYogiyoCompoundCouponsIntoTiers() {
        // 요기요 배너는 한 칸에 쿠폰 두 장을 적어 보낸다. 대표값
        // 하나로만 두면 선착순가 끝나 고정분만 남았을 때 그걸 알 길이 없다.

        // 정액 + 정률, 대표값이 문턱에서의 합과 같은 경우 (굽네치킨)
        //   4,000 + 25,000의 10% = 6,500
        var rate = banner("6,500원(4,000+10%)", "25,000원↑, 사용(발급X) 선착순", null)
                .compoundTiers();
        assertEquals(2, rate.size());
        assertEquals(4000, rate.get(0).amount());
        assertNull(rate.get(0).percent());
        assertEquals(10, rate.get(1).percent());
        assertEquals(25000, rate.get(1).minOrder());
        // 정률분을 미리 계산해 넣어야 사다리가 6,500을 낸다 —
        // DiscountLadder는 amount만 더한다.
        assertEquals(2500, rate.get(1).amount());
        // 대표값과 딱 맞으면 상한을 알 길이 없다.
        assertNull(rate.get(1).cap());

        // 정액 + 정률, 대표값이 상한인 경우 (파파존스, 문구가 extra에 있다)
        //   "최대 10,000원" = 고정 6,000 + 정률 상한 4,000
        //   25,000원에서 실제 받는 것은 6,000 + 2,500 = 8,500
        var capped = banner("최대 10,000원", "25,000원↑, 고정 6,000+선착순 10%", null)
                .compoundTiers();
        assertEquals(2, capped.size());
        assertEquals(6000, capped.get(0).amount());
        assertEquals(2500, capped.get(1).amount());
        assertEquals(10, capped.get(1).percent());
        assertEquals(4000, capped.get(1).cap());

        // "최대"를 안 적어도 같은 결과다 — 대표값이 문턱에서의 합보다
        // 크다는 사실 자체가 그게 상한이라는 뜻이다. 서버의 papajohns-20260824
        // 배너가 딱 이 모양이다(2026-08-25 실측).
        var live = banner("10,000원", "25,000원↑, 고정 6,000+선착순 10%", null)
                .compoundTiers();
        assertEquals(2, live.size());
        assertEquals(6000, live.get(0).amount());
        assertEquals(2500, live.get(1).amount());
        assertEquals(4000, live.get(1).cap());
        assertEquals(25000, live.get(1).minOrder());

        // 정액 + 정액 (합이 대표값과 같아야 한다)
        var two = banner("10,000원", "25,000원↑, 고정 6,000+선착순 4,000", null)
                .compoundTiers();
        assertEquals(2, two.size());
        assertEquals(6000, two.get(0).amount());
        assertEquals(4000, two.get(1).amount());

        // 대표값이 문턱 합보다 작으면 문구를 잘못 읽은 것이다 — 지어낸다.
        assertTrue(banner("5,000원", "25,000원↑, 고정 6,000+선착순 10%", null)
                .compoundTiers().isEmpty());
        assertTrue(banner("9,000원", "25,000원↑, 고정 6,000+선착순 4,000", null)
                .compoundTiers().isEmpty());

        // 복합이 아니면 지금까지와 같이 대표값 하나다.
        assertTrue(banner("7,000원", "16,000원↑, 선착순", null).compoundTiers().isEmpty());
        assertTrue(banner("최대 30%", "상시", null).compoundTiers().isEmpty());
        // 최소주문금액을 모르면 정률을 금액으로 바꿀 수 없다.
        assertTrue(banner("6,500원(4,000+10%)", "선착순", null).compoundTiers().isEmpty());
    }
}
