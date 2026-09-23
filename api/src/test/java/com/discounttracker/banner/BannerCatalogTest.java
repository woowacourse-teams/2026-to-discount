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
    void aBannerCanCarrySeveralBrandsAndTheFirstIsTheRepresentative() {
        // 2026-09-15: 쿠팡이츠 60계·처갓집·반올림이 같은 8,000원이라 한 장으로
        // 띄우는데, brand 하나만 그리면 나머지 둘이 눈에 안 띈다.
        String yaml = """
            banners:
              - id: ce-8000
                platform: coupangeats
                url: https://x
                amount: "8,000원"
                period: 이번 주
                brands: [60계치킨, 처갓집양념치킨, 반올림피자]
                startsOn: 2026-09-15
                endsOn: 2026-09-20
            """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-15");
        Banner b = catalog.active().get(0);
        assertEquals(List.of("60계치킨", "처갓집양념치킨", "반올림피자"), b.brands());
        assertEquals("60계치킨", b.brand());
        assertEquals(b.brands(), b.allBrands());
        // brands 없는 배너는 brand 하나가 전부다.
        assertEquals(List.of("교촌치킨"), banner("1원", null, null).allBrands());
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
    @Test
    void theOldShapeAndTheNewShapeReadTheSameOnScreen() {
        // 이행기 내내 두 모양이 같은 파일에 산다(RULES 9: 지난 배너 95장은 옛 모양으로
        // 남는다). 여태 둘이 같은 문구를 내는지 견주는 자리가 없었다. 옛 배너는 사람이
        // 적은 문장을 그대로 쓰고, 새 배너는 구조 칸에서 서버가 만든다 - 같은 행사면
        // 화면에 같은 글자가 떠야 한다(2026-09-24).
        String yaml = """
                banners:
                  - id: 옛모양-20260924
                    brand: 굽네치킨
                    platform: baemin
                    url: https://example.test/a
                    amount: "최대 8,000원"
                    period: 9/24 하루
                    startsOn: 2026-09-24
                    endsOn: 2026-09-24
                  - id: 새모양-20260924
                    brand: 굽네치킨
                    platform: baemin
                    url: https://example.test/b
                    amount:
                      won: [~, 8000]          # 하한 없음 = 상한액
                    startsAt: 2026-09-24T00:00:00
                    endsAt: 2026-09-24T23:59:59
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-24");
        assertEquals(List.of(), catalog.dropped(), "배너가 빠졌다");
        assertEquals(2, catalog.active().size(),
                "활성 배너: " + catalog.active().stream().map(Banner::id).toList());
        Banner old = catalog.active().stream().filter(b -> b.id().equals("옛모양-20260924"))
                .findFirst().orElseThrow();
        Banner made = catalog.active().stream().filter(b -> b.id().equals("새모양-20260924"))
                .findFirst().orElseThrow();

        assertEquals(old.amount(), made.amount(),
                "같은 금액인데 옛 배너와 새 배너의 금액 문구가 다르다");
        // 기간 문구는 아직 두 경로가 다르다. 사람은 "9/24 하루"로 적어 왔고 서버는
        // "9월 24일 하루"를 만든다. 어느 쪽을 쓸지는 사용자에게 보이는 문구라 개발자가
        // 정한다(COPY-STYLE 3). 정해지기 전까지는 다르다는 사실만 못박는다.
        assertEquals("9/24 하루", old.period());
        assertEquals("9월 24일 하루", made.period());
    }

    @Test
    void readsAMomentWrittenWithoutQuotes() {
        // snakeyaml이 따옴표 없는 시각을 Date로 만든다. 여태 그 배너가 조용히 버려졌다.
        String yaml = """
                banners:
                  - id: 따옴표없음-20260924
                    platform: baemin
                    url: https://example.test/a
                    amount: "6,000원"
                    period: 오늘
                    startsAt: 2026-09-24T00:00:00
                    endsAt: 2026-09-24T23:59:59
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-24");
        assertEquals(List.of(), catalog.dropped(), "따옴표 없는 시각이 배너를 버렸다");
        assertEquals(1, catalog.active().size());
    }

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
    void readsNotificationOptionsAndDefaultsMissingValuesToFalse() {
        String yaml = """
                banners:
                  - id: notification-enabled
                    brand: 교촌치킨
                    platform: baemin
                    url: https://example.test/notify
                    amount: "5,000원"
                    period: 오늘
                    startsOn: 2026-08-11
                    endsOn: 2026-08-11
                    notify: true
                    notifyImmediately: true
                  - id: notification-disabled
                    brand: bhc
                    platform: baemin
                    url: https://example.test/default
                    amount: "4,000원"
                    period: 오늘
                    startsOn: 2026-08-11
                    endsOn: 2026-08-11
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
    void reportsEntriesDroppedForMissingRequiredFields() {
        // 2026-09-18: 필수 필드가 빠진 배너가 조용히 빠졌고 reload는
        // bannersOk: true였다. 빠진 항목의 id를 돌려줘 사람이 바로 알게 한다.
        // platform은 같은 날 선택 필드가 됐다(자체 앱 행사) — url로 시험한다.
        String yaml = """
                banners:
                  - id: ok-20260918
                    platform: yogiyo
                    url: https://example.test/a
                    amount: "6,500원"
                    period: 상시
                    startsOn: 2026-09-18
                    endsOn: 2026-09-18
                  - id: no-url-20260918
                    platform: baemin
                    amount: "6,000원"
                    period: 상시
                    startsOn: 2026-09-18
                    endsOn: 2026-09-18
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-18");
        assertEquals(1, catalog.active().size());
        assertEquals(List.of("no-url-20260918"), catalog.dropped());
    }

    @Test
    void reportsBannersThatShareAnId() {
        // 파일을 손으로 고치면 적용 시점 검사(ops_apply.duplicate_id_problem)를 지나간다.
        // id가 겹치면 "이 id의 배너"가 파일 순서로 정해진다 - API는 맵을 id로 찾고
        // 콘솔도 id로 찾는다. 읽을 때 한 번 더 본다(2026-09-24).
        String yaml = """
                banners:
                  - id: 겹침-20260924
                    platform: baemin
                    url: https://example.test/a
                    amount: "6,000원"
                    period: 상시
                    startsOn: 2026-09-24
                    endsOn: 2026-09-24
                  - id: 겹침-20260924
                    platform: yogiyo
                    url: https://example.test/b
                    amount: "7,000원"
                    period: 상시
                    startsOn: 2026-09-24
                    endsOn: 2026-09-24
                  - id: 안겹침-20260924
                    platform: ddangyo
                    url: https://example.test/c
                    amount: "5,000원"
                    period: 상시
                    startsOn: 2026-09-24
                    endsOn: 2026-09-24
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
                    amount: "6,000원"
                    period: 상시
                    startsOn: 2026-09-24
                    endsOn: 2026-09-24
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
                    amount: "최대 10,000원, 50% 적립"
                    period: 9월 18일 하루
                    startsOn: 2026-09-18
                    endsOn: 2026-09-18
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-18");
        assertEquals(1, catalog.active().size());
        assertEquals("own", catalog.active().get(0).platform());
        assertTrue(catalog.active().get(0).isOwn());
        assertEquals(List.of(), catalog.dropped());
    }

    @Test
    void buildsTextFromStructuredFieldsWhenSentencesAreEmpty() {
        // Task 5/6 새 모양: 문장 칸 없이 amount(구조 필드)만 적어도 카드가 선다. 적힌 문장은
        // 이긴다. 옛 모양의 묶음(items)은 이제 여러 배너를 group으로 한 장에 접는다(Task 6).
        String yaml = """
                banners:
                  - id: coupangeats-open-버거킹-20260918
                    group: coupangeats-open-20260918
                    platform: coupangeats
                    url: https://example.test/hub
                    brand: 버거킹
                    amount: {won: 4000}
                    firstCome: issue
                    startsOn: 2026-09-18
                    endsOn: 2026-09-18
                    priority: 1
                  - id: coupangeats-open-호식이-20260918
                    group: coupangeats-open-20260918
                    platform: coupangeats
                    url: https://example.test/hub2
                    brand: 호식이두마리치킨
                    amount: {won: 6000}
                    firstCome: issue
                    startsOn: 2026-09-18
                    endsOn: 2026-09-18
                    priority: 2
                  - id: bhc-20260918
                    brand: bhc
                    platform: coupangeats
                    url: https://example.test/bhc
                    amount: {won: [null, 7000], random: true}
                    period: 일일 슈퍼딜
                    startsOn: 2026-09-18
                    endsOn: 2026-09-18
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-18");
        assertEquals(2, catalog.active().size(), "묶음 둘은 한 장으로 접힌다");
        Banner open = catalog.active().stream()
                .filter(b -> b.id().equals("coupangeats-open-버거킹-20260918")).findFirst().orElseThrow();
        assertEquals("4,000원", open.amount());          // 대표(우선순위가 작은) 구성원 자신의 값
        assertEquals("9월 18일 하루", open.period());
        assertEquals("발급 선착순", open.extra());
        assertEquals(List.of("버거킹", "호식이두마리치킨"), open.brands());
        assertEquals("버거킹", open.brand());
        Banner bhc = catalog.active().stream()
                .filter(b -> b.id().equals("bhc-20260918")).findFirst().orElseThrow();
        assertEquals("최대 7,000원", bhc.amount());
        assertEquals("일일 슈퍼딜", bhc.period());            // 적힌 문장이 이긴다
        assertEquals("랜덤쿠폰", bhc.extra());
        assertNotNull(bhc.amountSpec());
    }

    @Test
    void backfillsFirstComeTargetedAndCashbackFromLimitUsageOnlyWhenTheNewFieldsAreEmpty() {
        // Task 18 fix round 2. web/src/bannerTag.js가 이제 firstCome/targeted/amountSpec만
        // 읽는다 - RULES 8·9로 옛 모양 그대로 남는 배너는 이 세 칸이 비어 있을 수 있어
        // 여기서 옛 limit/usage 칸으로 채운다. period·extra 문장은 안 본다(fix round 1의
        // 문장 정규식은 되돌렸다) - "적립금은 본 행사에 사용 불가", "가을맞이 신규 오픈
        // 매장 한정" 같은 문장이 오탐을 내고, RULES 9로 옛 모양이 무기한 남아 "이행기용"
        // 파서가 안 끝난다(리뷰어 지적, fix round 2). 살아있는 배너는 운영자가
        // firstCome/limit을 직접 적는 것으로 해결한다.
        String yaml = """
                banners:
                  - id: coupangeats-open-20260923-17시
                    platform: coupangeats
                    url: https://example.test/hub
                    brand: 두찜
                    amount: 7,000원
                    period: 오늘 17시 선착순
                    extra: 17시~ 와우 전용
                    firstCome: issue
                    startsOn: 2026-09-23
                    endsOn: 2026-09-23
                  - id: 처갓집양념치킨-legacy-limit
                    brand: 처갓집양념치킨
                    platform: baemin
                    url: https://example.test/jutgas
                    amount: 8,000원
                    period: 오늘의 핫딜
                    startsOn: 2026-09-23
                    endsOn: 2026-09-23
                    limit: first_come
                    usage: use
                  - id: 백억커피-legacy-cashback
                    brand: 백억커피
                    url: https://example.test/coffee
                    amount: 최대 10,000원, 50% 적립
                    period: 9/21~10/11
                    startsOn: 2026-09-21
                    endsOn: 2026-10-11
                    limit: cashback
                  - id: coupangeats-weekly-legacy-random
                    brand: bhc
                    platform: coupangeats
                    url: https://example.test/bhc
                    amount: 최대 7,000원
                    period: 일일 슈퍼딜
                    startsOn: 2026-09-23
                    endsOn: 2026-09-23
                    limit: random
                  - id: has-new-field-already
                    brand: 교촌치킨
                    platform: baemin
                    url: https://example.test/kyochon
                    amount: 5,000원
                    period: 선착순 특가
                    firstCome: issue
                    startsOn: 2026-09-23
                    endsOn: 2026-09-23
                  - id: 적립금-오탐-문구
                    brand: bhc
                    platform: baemin
                    url: https://example.test/bhc2
                    amount: 5,000원
                    period: 가을맞이 신규 오픈 매장 한정
                    extra: 적립금은 본 행사에 사용 불가
                    startsOn: 2026-09-23
                    endsOn: 2026-09-23
                """;
        BannerCatalog catalog = catalogOn(yaml, "2026-09-23");
        var byId = catalog.active().stream()
                .collect(java.util.stream.Collectors.toMap(Banner::id, b -> b));

        // firstCome을 사람이 직접 적었으면 그 값이 그대로다.
        assertEquals("issue", byId.get("coupangeats-open-20260923-17시").firstCome());
        // limit: first_come + usage: use — 옛 아홉 칸 시절 신호에서 채운다.
        assertEquals("use", byId.get("처갓집양념치킨-legacy-limit").firstCome());
        // limit: cashback — amountSpec이 새로 생겨 kind가 CASHBACK이 된다.
        assertNotNull(byId.get("백억커피-legacy-cashback").amountSpec());
        assertEquals(com.discounttracker.offer.AmountKind.CASHBACK,
                byId.get("백억커피-legacy-cashback").amountSpec().kind());
        // limit: random — amountSpec이 새로 생겨 random이 켜진다.
        assertNotNull(byId.get("coupangeats-weekly-legacy-random").amountSpec());
        assertTrue(byId.get("coupangeats-weekly-legacy-random").amountSpec().random());
        // firstCome을 사람이 직접 적었으면 그 값(issue)이 그대로다 — 백필이 덮어쓰지 않는다.
        assertEquals("issue", byId.get("has-new-field-already").firstCome());
        // "적립"/"오픈" 같은 단어가 문장에 있어도 limit/usage가 없으면 그냥 지나간다 —
        // 문장을 더는 정규식으로 되짚지 않는다(fix round 2).
        Banner falsePositive = byId.get("적립금-오탐-문구");
        assertNull(falsePositive.firstCome());
        assertNull(falsePositive.amountSpec());
    }

    @Test
    void readsMinOrderOutOfTheExtraLineWhenNobodyFilledTheField() {
        // 사람은 extra에 "16,000원↑"를 적고 끝낸다. 실측(2026-08-25)에서
        // 살아 있는 배너 셋 전부가 minOrder를 비워 둔 채였고, 그 배너가
        // 카드에 설 때 조건이 전부 "최소주문 미확인"으로 떴어졌다.
        assertEquals(16000, banner("16,000원↑, 사용(발급X) 선착순", null).effectiveMinOrder());
        assertEquals(18900, banner("18,900원 이상", null).effectiveMinOrder());
        assertEquals(20000, banner("최소주문 20,000원, 선착순 300명", null).effectiveMinOrder());

        // "원"을 빼고 적기도 한다. 손으로 쓰는 칸이라 실제로 그랬고
        // (2026-08-29 처갓집 "16,000↑"), 그때 카드 조건이 "최소주문 미확인"
        // 으로 떴다. 최소주문금액이라는 신호는 뒤따르는 화살표지 "원"이 아니다.
        assertEquals(16000, banner("16,000↑, 선착순 할인 · 사용선착순", null).effectiveMinOrder());
        assertEquals(18900, banner("18,900 이상", null).effectiveMinOrder());

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
        return Banner.of("id", "https://example.test")
                .brand("교촌치킨").platform("baemin")
                .amount(amount).period("상시").extra(extra).minOrder(minOrder)
                .startsOn(java.time.LocalDate.parse("2026-08-25"))
                .endsOn(java.time.LocalDate.parse("2026-08-25"))
                .priority(1)
                .build();
    }

    @Test
    void headlineTakesTheFirstOfSlashSeparatedAmounts() {
        // "8,000/5,000/6,000원" — 시간대별 금액 나열. 원이 맨 뒤에만 붙어
        // "n원"만 찾으면 마지막 6,000이 대표가 됐다(2026-09-14 실측 7건).
        // 사람이 적은 순서대로 맨 앞이 대표다.
        assertEquals(8000, banner("8,000/5,000/6,000원", null, null).headlineAmount());
        assertEquals(7000, banner("7,000/1,900원", null, null).headlineAmount());
        assertEquals(6000, banner("6,000 / 5,000원", null, null).headlineAmount());
        assertEquals(5000, banner("5,000/8,000원", null, null).headlineAmount());
        // 나열이 아니면 그대로
        assertEquals(6500, banner("6,500원(4,000+10%)", null, null).headlineAmount());
        assertNull(banner("최대 30%", null, null).headlineAmount());
    }

    @Test
    void thousandShorthandPairsEveryBrandOfABundle() {
        // banner_routine.group_first_come이 "7/6/6/5천원"으로 적는다. 2026-09-21까지 이 꼴은
        // HEADLINE에 안 걸려 묶음 배너의 브랜드 오퍼가 하나도 안 섰다.
        Banner bundle = Banner.of("id", "https://example.test")
                .platform("coupangeats").amount("7/6/6/5천원").period("오늘 17시 선착순")
                .startsOn(java.time.LocalDate.parse("2026-09-21"))
                .endsOn(java.time.LocalDate.parse("2026-09-21"))
                .priority(1)
                .brands(java.util.List.of("두찜", "자담치킨", "후라이드참잘하는집", "꾸브라꼬숯불치킨"))
                .build();
        assertEquals(7000, bundle.headlineAmount());
        assertEquals(java.util.List.of(
                java.util.Map.entry("두찜", 7000), java.util.Map.entry("자담치킨", 6000),
                java.util.Map.entry("후라이드참잘하는집", 6000), java.util.Map.entry("꾸브라꼬숯불치킨", 5000)),
                bundle.brandAmounts());
        assertEquals(5000, banner("5천원", null, null).headlineAmount());
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
