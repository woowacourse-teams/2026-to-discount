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
            amount: {won: 12000}
            minOrder: 20000
            firstCome: issue
            color: "#c8102e"
            startsAt: '2026-08-11T00:00:00'
            endsAt: '2026-08-11T23:59:59'
            priority: 1
          - id: ddangyo-first-order
            platform: ddangyo
            url: https://ddangyo.example/first
            amount: {won: 5000}
            startsAt: '2026-08-01T00:00:00'
            endsAt: '2026-08-31T23:59:59'
          - id: 지난주-행사
            platform: yogiyo
            url: https://yogiyo.example/last-week
            amount: {won: 3000}
            startsAt: '2026-08-01T00:00:00'
            endsAt: '2026-08-07T23:59:59'
        """;

    @Test
    void startsUpEvenWhenTheFileIsUnparseable() {
        // 2026-08-21: 배너 항목 사이 콤마 하나가 빠져 이 생성자가 예외를 던졌고,
        // 스프링 컨텍스트가 못 떠 API 전체가 502였다(systemd 재시작 4회).
        // 배너는 부가 정보다 — 배너만 비고 브랜드·통계·이벤트 수집은 살아야 한다.
        String broken = """
            banners: [
              { id: a, platform: baemin, url: https://x, amount: {won: 1},
                startsAt: '2026-08-21T00:00:00', endsAt: '2026-08-21T23:59:59' }
              { id: b, platform: baemin, url: https://y, amount: {won: 2},
                startsAt: '2026-08-21T00:00:00', endsAt: '2026-08-21T23:59:59' }
            ]
            """;
        BannerCatalog catalog = catalogOn(broken, "2026-08-21");
        assertEquals(List.of(), catalog.active());
    }

    @Test
    void aBannerCanCarrySeveralBrandsAndTheFirstIsTheRepresentative() {
        // 2026-09-15: 쿠팡이츠 60계·처갓집·반올림이 같은 8,000원이라 한 장으로
        // 띄우는데, brand 하나만 그리면 나머지 둘이 눈에 안 띈다.
        String yaml = """
            banners:
              - id: ce-8000
                platform: coupangeats
                url: https://x
                amount: {won: 8000}
                brands: [60계치킨, 처갓집양념치킨, 반올림피자]
                startsAt: '2026-09-15T00:00:00'
                endsAt: '2026-09-20T23:59:59'
            """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-15");
        Banner b = catalog.active().get(0);
        assertEquals(List.of("60계치킨", "처갓집양념치킨", "반올림피자"), b.brands());
        assertEquals("60계치킨", b.brand());
        assertEquals(b.brands(), b.allBrands());
        // brands 없는 배너는 brand 하나가 전부다.
        Banner single = Banner.of("id", "https://example.test").brand("교촌치킨")
                .startsOn(java.time.LocalDate.parse("2026-08-25"))
                .endsOn(java.time.LocalDate.parse("2026-08-25"))
                .build();
        assertEquals(List.of("교촌치킨"), single.allBrands());
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

    @Test
    void readsAMomentWrittenWithoutQuotes() {
        // snakeyaml이 따옴표 없는 시각을 Date로 만든다. 여태 그 배너가 조용히 버려졌다.
        String yaml = """
                banners:
                  - id: 따옴표없음-20260924
                    platform: baemin
                    url: https://example.test/a
                    amount: {won: 6000}
                    startsAt: 2026-09-24T00:00:00
                    endsAt: 2026-09-24T23:59:59
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-24");
        assertEquals(List.of(), catalog.dropped(), "따옴표 없는 시각이 배너를 버렸다");
        assertEquals(1, catalog.active().size());
    }

    @Test
    void droppedBannerCarriesItsReason() {
        // 2026-09-30: 내리기 op가 당일 시작 배너에 전날 끝(endsAt 09-29 23:59:59)을 적어
        // 쿠팡이츠 오픈 3장이 dropped에 이름만 남기고 사라졌다. 사유를 같이 싣는다.
        String yaml = """
                banners:
                  - id: coupangeats-open-20260930-9시
                    platform: coupangeats
                    url: https://example.test/a
                    amount: {won: [null, 6000]}
                    startsAt: '2026-09-30T00:00:00'
                    endsAt: '2026-09-29T23:59:59'
                  - id: 링크없음-20260930
                    platform: baemin
                    amount: {won: 5000}
                    startsAt: '2026-09-30T00:00:00'
                    endsAt: '2026-09-30T23:59:59'
                  - id: 멀쩡-20260930
                    platform: baemin
                    url: https://example.test/b
                    amount: {won: 5000}
                    startsAt: '2026-09-30T00:00:00'
                    endsAt: '2026-09-30T23:59:59'
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-30");
        assertEquals(List.of("coupangeats-open-20260930-9시", "링크없음-20260930"), catalog.dropped());
        assertTrue(catalog.droppedReasons().get("coupangeats-open-20260930-9시").contains("endsAt"),
                catalog.droppedReasons().toString());
        assertTrue(catalog.droppedReasons().get("링크없음-20260930").contains("url"),
                catalog.droppedReasons().toString());
    }

    @Test
    void oldShapeBannersAreDroppedWithAReasonNotSilently() {
        // 2026-10-15: 문장 amount("12,000원")와 날짜만 적은 startsOn/endsOn을 읽는 길을 지웠다.
        // 파일에 남은 옛 배너가 말없이 사라지면 안 된다 - 이름과 사유가 dropped에 남아
        // POST /api/reload가 알린다. 같은 파일의 새 모양 배너는 그대로 선다.
        String yaml = """
                banners:
                  - id: 옛금액-20260811
                    brand: 교촌치킨
                    platform: baemin
                    url: https://example.test/a
                    amount: "12,000원"
                    startsAt: '2026-08-11T00:00:00'
                    endsAt: '2026-08-11T23:59:59'
                  - id: 옛날짜-20260811
                    brand: 교촌치킨
                    platform: baemin
                    url: https://example.test/b
                    amount: {won: 12000}
                    startsOn: 2026-08-11
                    endsOn: 2026-08-11
                  - id: 새모양-20260811
                    brand: 교촌치킨
                    platform: baemin
                    url: https://example.test/c
                    amount: {won: 12000}
                    minOrder: 20000
                    period: 8/11 하루만
                    extra: 사람이 적은 문장
                    startsAt: '2026-08-11T00:00:00'
                    endsAt: '2026-08-11T23:59:59'
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-08-11");

        assertEquals(List.of("옛금액-20260811", "옛날짜-20260811"), catalog.dropped());
        assertTrue(catalog.droppedReasons().get("옛금액-20260811").contains("amount가 문장이다"),
                catalog.droppedReasons().toString());
        assertTrue(catalog.droppedReasons().get("옛날짜-20260811").contains("startsAt"),
                catalog.droppedReasons().toString());

        assertEquals(List.of("새모양-20260811"), catalog.active().stream().map(Banner::id).toList());
        Banner stands = catalog.active().get(0);
        assertEquals("12,000원", stands.amount());
        // 파일에 남은 period, extra 문장은 읽지 않는다. 화면 문구는 늘 구조 칸에서 서버가 만든다.
        assertEquals("8월 11일 하루", stands.period());
        assertEquals("20,000원↑", stands.extra());
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
                    amount: {won: 6500}
                    startsAt: '2026-08-17T00:00:00'
                    endsAt: '2026-08-23T23:59:59'
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
                    amount: {won: 8000}
                    startsAt: '2026-08-20T00:00:00'
                    endsAt: '2026-08-20T23:59:59'
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
                amount: {won: 1000}
                startsAt: '2026-08-01T00:00:00'
                endsAt: '2026-08-31T23:59:59'
              - id: 먼저-끝남
                platform: yogiyo
                url: https://example.test/2
                amount: {won: 2000}
                startsAt: '2026-08-01T00:00:00'
                endsAt: '2026-08-11T23:59:59'
              - id: 우선순위-높음
                platform: ddangyo
                url: https://example.test/3
                amount: {won: 3000}
                startsAt: '2026-08-01T00:00:00'
                endsAt: '2026-08-20T23:59:59'
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
        // 금액 문구는 적은 문장이 아니라 won 칸에서 서버가 만든다.
        assertEquals("5,000원", appWide.amount());
    }

    @Test
    void readsNotificationOptionsAndDefaultsMissingValuesToFalse() {
        String yaml = """
                banners:
                  - id: notification-enabled
                    brand: 교촌치킨
                    platform: baemin
                    url: https://example.test/notify
                    amount: {won: 5000}
                    startsAt: '2026-08-11T00:00:00'
                    endsAt: '2026-08-11T23:59:59'
                    notify: true
                    notifyImmediately: true
                  - id: notification-disabled
                    brand: bhc
                    platform: baemin
                    url: https://example.test/default
                    amount: {won: 4000}
                    startsAt: '2026-08-11T00:00:00'
                    endsAt: '2026-08-11T23:59:59'
                """;

        List<Banner> active = catalogOn(yaml, "2026-08-11").active();
        // 우선순위와 종료일이 같으면 이제 id로 갈린다(그룹을 접을 때 순서를 정하려고
        // 더한 세 번째 정렬 기준) - 자리 대신 id로 찾는다.
        Banner enabled = active.stream().filter(b -> b.id().equals("notification-enabled")).findFirst().orElseThrow();
        Banner disabled = active.stream().filter(b -> b.id().equals("notification-disabled")).findFirst().orElseThrow();
        assertTrue(enabled.notificationEnabled());
        assertTrue(enabled.immediateNotificationRequested());
        assertFalse(disabled.notificationEnabled());
        assertFalse(disabled.immediateNotificationRequested());
    }

    @Test
    void requiredFieldsPresentAreKept() {
        Banner b = catalogOn(YAML, "2026-08-11").active().get(0);
        assertEquals("교촌치킨", b.brand());
        assertEquals("baemin", b.platform());
        assertEquals("https://s.baemin.com/kyochon", b.url());
        // 화면 문구 셋은 구조 칸(amount, 시각, minOrder, firstCome)에서 서버가 만든다.
        assertEquals("12,000원", b.amount());
        assertEquals("8월 11일 하루", b.period());
        assertEquals("20,000원↑, 발급 선착순", b.extra());
        assertEquals("#c8102e", b.color());
    }

    @Test
    void entryMissingRequiredFieldIsSkippedWithoutKillingTheRest() {
        // 손으로 고치는 파일이라 오타 하나로 나머지까지 죽으면 안 된다.
        String yaml = """
            banners:
              - id: url-없음
                platform: baemin
                amount: {won: 1000}
                startsAt: '2026-08-11T00:00:00'
                endsAt: '2026-08-11T23:59:59'
              - id: 멀쩡함
                platform: baemin
                url: https://example.test/ok
                amount: {won: 2000}
                startsAt: '2026-08-11T00:00:00'
                endsAt: '2026-08-11T23:59:59'
            """;
        assertEquals(List.of("멀쩡함"),
                catalogOn(yaml, "2026-08-11").active().stream().map(Banner::id).toList());
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
                    amount: {won: 7000},
                    startsAt: '2026-08-22T00:00:00',
                    endsAt: '2026-08-22T23:59:59'
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
                    amount: {won: 6500}
                    startsAt: '2026-08-17T00:00:00'
                    endsAt: '2026-08-23T23:59:59'
                  - id: unknown-20260820
                    brand: touslesjours
                    platform: baemin
                    url: https://example.test/b
                    amount: {won: 6000}
                    startsAt: '2026-08-17T00:00:00'
                    endsAt: '2026-08-23T23:59:59'
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-08-20");
        assertEquals(List.of("touslesjours"), catalog.unknownBrands());
    }

    @Test
    void reportsEntriesDroppedForMissingRequiredFields() {
        // 2026-09-18: 필수 필드가 빠진 배너가 조용히 빠졌고 reload는
        // bannersOk: true였다. 빠진 항목의 id를 돌려줘 사람이 바로 알게 한다.
        // platform은 같은 날 선택 필드가 됐다(자체 앱 행사) — url로 시험한다.
        String yaml = """
                banners:
                  - id: ok-20260918
                    platform: yogiyo
                    url: https://example.test/a
                    amount: {won: 6500}
                    startsAt: '2026-09-18T00:00:00'
                    endsAt: '2026-09-18T23:59:59'
                  - id: no-url-20260918
                    platform: baemin
                    amount: {won: 6000}
                    startsAt: '2026-09-18T00:00:00'
                    endsAt: '2026-09-18T23:59:59'
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-18");
        assertEquals(1, catalog.active().size());
        assertEquals(List.of("no-url-20260918"), catalog.dropped());
    }

    @Test
    void entryEndingBeforeItStartsIsDroppedWithoutKillingTheRest() {
        // 2026-09-29 백로그 #5: Banner.build()가 기간을 검사한다. 끝이 시작보다 앞인
        // 배너는 한 번도 뜰 수 없다. 예외가 reload 전체를 죽이지 않고 dropped로 가야 한다.
        String yaml = """
                banners:
                  - id: ok-20260918
                    platform: yogiyo
                    url: https://example.test/a
                    amount: {won: 6500}
                    startsAt: '2026-09-18T00:00:00'
                    endsAt: '2026-09-18T23:59:59'
                  - id: backwards-20260918
                    platform: baemin
                    url: https://example.test/b
                    amount: {won: 6000}
                    startsAt: "2026-09-18T12:00:00"
                    endsAt: "2026-09-18T11:00:00"
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-18");
        assertEquals(1, catalog.active().size());
        assertEquals(List.of("backwards-20260918"), catalog.dropped());
    }

    @Test
    void reportsBannersThatShareAnId() {
        // 파일을 손으로 고치면 적용 시점 검사(beggars-ops ops_apply.duplicate_id_problem)를 지나간다.
        // id가 겹치면 "이 id의 배너"가 파일 순서로 정해진다 - API는 맵을 id로 찾고
        // 콘솔도 id로 찾는다. 읽을 때 한 번 더 본다(2026-09-24).
        String yaml = """
                banners:
                  - id: 겹침-20260924
                    platform: baemin
                    url: https://example.test/a
                    amount: {won: 6000}
                    startsAt: '2026-09-24T00:00:00'
                    endsAt: '2026-09-24T23:59:59'
                  - id: 겹침-20260924
                    platform: yogiyo
                    url: https://example.test/b
                    amount: {won: 7000}
                    startsAt: '2026-09-24T00:00:00'
                    endsAt: '2026-09-24T23:59:59'
                  - id: 안겹침-20260924
                    platform: ddangyo
                    url: https://example.test/c
                    amount: {won: 5000}
                    startsAt: '2026-09-24T00:00:00'
                    endsAt: '2026-09-24T23:59:59'
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-24");
        assertEquals(List.of("겹침-20260924"), catalog.duplicateIds());
    }

    @Test
    void reportsNoDuplicateIdsWhenEveryIdIsItsOwn() {
        String yaml = """
                banners:
                  - id: 하나-20260924
                    platform: baemin
                    url: https://example.test/a
                    amount: {won: 6000}
                    startsAt: '2026-09-24T00:00:00'
                    endsAt: '2026-09-24T23:59:59'
                """;
        assertEquals(List.of(), catalogOn(yaml, "2026-09-24").duplicateIds());
    }

    @Test
    void keepsBannersWithoutPlatformAsOwnAppEvents() {
        // 2026-09-18 뚜레쥬르 네이버페이 적립: 배달앱 밖 행사라 platform이 없다.
        String yaml = """
                banners:
                  - id: 뚜레쥬르-20260918
                    brand: 뚜레쥬르
                    url: https://example.test/tlj
                    amount: {percent: 50, kind: cashback}
                    startsAt: '2026-09-18T00:00:00'
                    endsAt: '2026-09-18T23:59:59'
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-18");
        assertEquals(1, catalog.active().size());
        assertEquals("own", catalog.active().get(0).platform());
        assertTrue(catalog.active().get(0).isOwn());
        assertEquals(List.of(), catalog.dropped());
    }

    @Test
    void buildsTextFromStructuredFields() {
        // 화면 문구(금액, 기간, 부가 조건)는 늘 구조 필드에서 서버가 만든다. 묶음은 여러 배너를
        // group으로 한 장에 접는다(Task 6).
        // 묶음은 링크가 같아야 접힌다(확정 규칙 4절, 2026-09-29). 전에는 구성원 링크가 hub, hub2로
        // 달랐는데 그러면 이제 접지 않고 따로 띄운다(BannerGroupTest가 그 동작을 본다).
        String yaml = """
                banners:
                  - id: coupangeats-open-버거킹-20260918
                    group: coupangeats-open-20260918
                    platform: coupangeats
                    url: https://example.test/hub
                    brand: 버거킹
                    amount: {won: 4000}
                    firstCome: issue
                    startsAt: '2026-09-18T00:00:00'
                    endsAt: '2026-09-18T23:59:59'
                    priority: 1
                  - id: coupangeats-open-호식이-20260918
                    group: coupangeats-open-20260918
                    platform: coupangeats
                    url: https://example.test/hub
                    brand: 호식이두마리치킨
                    amount: {won: 6000}
                    firstCome: issue
                    startsAt: '2026-09-18T00:00:00'
                    endsAt: '2026-09-18T23:59:59'
                    priority: 2
                  - id: bhc-20260918
                    brand: bhc
                    platform: coupangeats
                    url: https://example.test/bhc
                    amount: {won: [null, 7000], random: true}
                    startsAt: '2026-09-18T00:00:00'
                    endsAt: '2026-09-18T23:59:59'
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-18");
        assertEquals(2, catalog.active().size(), "묶음 둘은 한 장으로 접힌다");
        Banner open = catalog.active().stream()
                .filter(b -> b.id().equals("coupangeats-open-버거킹-20260918")).findFirst().orElseThrow();
        // 구성원 금액이 다르면 묶음 한 장이 전부를 적는다(2026-09-24). 대표 것 하나만
        // 찍으면 4,000원인 줄 알고 호식이를 누른다. 순서는 브랜드 늘어선 순서와 같다.
        assertEquals("4/6천원", open.amount());
        assertEquals("9월 18일 하루", open.period());
        assertEquals("발급 선착순", open.extra());
        assertEquals(List.of("버거킹", "호식이두마리치킨"), open.brands());
        assertEquals("버거킹", open.brand());
        Banner bhc = catalog.active().stream()
                .filter(b -> b.id().equals("bhc-20260918")).findFirst().orElseThrow();
        assertEquals("최대 7,000원", bhc.amount());
        assertEquals("9월 18일 하루", bhc.period());
        assertEquals("랜덤쿠폰", bhc.extra());
        assertNotNull(bhc.amountSpec());
    }
}
