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
                url: "https://example.test/doubleday"
                amount: {won: 7000}
                minOrder: 15000
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 5
              - id: albolo-20260922
                group: ddangyo-doubleday-0922
                brand: 피자알볼로
                platform: ddangyo
                url: "https://example.test/doubleday"
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
    void groupShowsEveryMemberAmountWhenTheyDiffer() {
        // 구성원 금액이 다르면 대표 것 하나만 찍을 수 없다. 8,000원만 보이면 던킨을
        // 누른 사람이 8,000원인 줄 안다. 브랜드 늘어선 순서와 같은 순서로 적는다
        // (2026-09-24: 수집기가 묶음을 brands 배열 대신 group으로 적게 되면서 드러났다).
        Banner card = catalog(TWO_IN_A_GROUP).active().get(0);
        assertEquals(List.of("피자알볼로", "던킨"), card.brands());
        assertEquals("8/7천원", card.amount());
    }

    @Test
    void groupShowsOneAmountWhenEveryMemberIsTheSame() {
        String yml = TWO_IN_A_GROUP.replace("{won: 7000}", "{won: 8000}");
        assertEquals("8,000원", catalog(yml).active().get(0).amount());
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
                url: "https://example.test/crossed"
                color: "#000001"
                amount: {won: 1111}
                startsAt: 2026-09-22T00:00
                endsAt: 2026-09-22T23:59
                priority: 1
              - id: aaa-20260922
                group: crossed-0922
                brand: 에이브랜드
                platform: ddangyo
                url: "https://example.test/crossed"
                color: "#000009"
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
        // id가 앞선 aaa가 대표가 되어 버린다 - 대표가 대는 color로 zzz가 이겼는지 본다.
        // (2026-09-29부터 묶음은 링크가 같아야 해서 url로는 대표를 못 가른다.)
        //
        // 금액으로는 못 본다. 2026-09-24부터 구성원 금액이 다르면 묶음 한 장이 전부를
        // 적는다("1,111/2,222원") - 대표 것 하나만 찍으면 그 값이 아닌 브랜드를 누른
        // 사람이 속기 때문이다. 순서가 대표부터라는 것은 그 문구로도 확인된다.
        Banner card = catalog(CROSSED_PRIORITY_AND_ID).active().get(0);
        assertEquals("#000001", card.color());
        assertEquals("1,111/2,222원", card.amount(), "대표(zzz) 금액이 앞에 온다");
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
                    url: "https://example.test/tied"
                    color: "#00000a"
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
                    url: "https://example.test/tied"
                    color: "#00000b"
                    amount: {won: 4000}
                    startsAt: 2026-09-22T00:00
                    endsAt: 2026-09-22T23:59
                    priority: 3
                """;
        Banner aFirstInFile = catalog("banners:\n" + memberA + memberB).active().get(0);
        Banner bFirstInFile = catalog("banners:\n" + memberB + memberA).active().get(0);
        assertEquals("#00000a", aFirstInFile.color(), "id-a가 id-b보다 앞선다");
        assertEquals(aFirstInFile.color(), bFirstInFile.color(), "파일 순서를 바꿔도 대표는 같다");
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

    @Test
    void aCollectedFirstComeGroupDrawsOneCardAndFourOffers() {
        // 2026-09-24 수집기가 실제로 내보내는 모양. 17시 선착순 네 곳이 group으로 묶인다.
        String yml = """
                banners:
                  - id: coupangeats-open-20260925-17시-두찜
                    group: coupangeats-open-20260925-17시
                    brand: 두찜
                    platform: coupangeats
                    url: "https://example.test/hub"
                    amount: {won: 7000}
                    startsAt: 2026-09-22T00:00:00
                    endsAt: 2026-09-22T23:59:59
                    opensAt: "17:00"
                    firstCome: issue
                    priority: 6
                  - id: coupangeats-open-20260925-17시-자담치킨
                    group: coupangeats-open-20260925-17시
                    brand: 자담치킨
                    platform: coupangeats
                    url: "https://example.test/hub"
                    amount: {won: 6000}
                    startsAt: 2026-09-22T00:00:00
                    endsAt: 2026-09-22T23:59:59
                    opensAt: "17:00"
                    firstCome: issue
                    priority: 7
                  - id: coupangeats-open-20260925-17시-꾸브라꼬숯불치킨
                    group: coupangeats-open-20260925-17시
                    brand: 꾸브라꼬 숯불치킨
                    platform: coupangeats
                    url: "https://example.test/hub"
                    amount: {won: 5000}
                    startsAt: 2026-09-22T00:00:00
                    endsAt: 2026-09-22T23:59:59
                    opensAt: "17:00"
                    firstCome: issue
                    priority: 8
                """;
        BannerCatalog catalog = catalog(yml);

        assertEquals(1, catalog.active().size(), "화면에는 한 장");
        Banner card = catalog.active().get(0);
        assertEquals(List.of("두찜", "자담치킨", "꾸브라꼬 숯불치킨"), card.brands());
        assertEquals("7/6/5천원", card.amount(), "구성원 금액을 브랜드 순서대로 적는다");
        assertEquals("오후 5시 오픈", card.period());   // 하루짜리라 "매일"이 안 붙는다
        assertEquals(6, card.priority(), "묶음 우선순위는 구성원 최솟값");
        assertEquals("발급 선착순", card.extra());

        List<Banner> members = catalog.activeMembers();
        assertEquals(3, members.size(), "오퍼는 브랜드마다 하나");
        // 오퍼는 브랜드마다 다른 카드로 가므로 구성원 사이의 순서는 뜻이 없다
        // (activeMembers가 묶음 우선순위를 최솟값으로 덮어 id순이 된다). 값만 본다.
        assertEquals(java.util.Map.of("두찜", 7000, "자담치킨", 6000, "꾸브라꼬 숯불치킨", 5000),
                members.stream().collect(java.util.stream.Collectors.toMap(
                        Banner::brand, m -> m.amountSpec().wonMax())),
                "브랜드마다 제 금액을 갖는다 - 문장 amount로는 못 하던 것");
    }

    @Test
    void dailyOpenGroupKeepsEachMembersOpeningTime() {
        // 2026-09-30 사용자 결정: 쿠팡이츠 선착순 오픈은 하루치를 한 장으로 묶는다. 구성원마다
        // 여는 시각이 달라도 묶음이고, 시각은 구성원마다 members에 싣는다. 카드 기간 문구는
        // 대표 시각이 아니라 하루 문구다 - 대표 시각을 쓰면 다른 구성원에 대해 거짓말을 한다.
        String yml = """
                banners:
                  - id: coupangeats-open-20260922-9시-뚜레쥬르
                    group: coupangeats-open-20260922
                    brand: 뚜레쥬르
                    platform: coupangeats
                    url: "https://example.test/hub"
                    amount: {won: 6000}
                    startsAt: 2026-09-22T00:00:00
                    endsAt: 2026-09-22T23:59:59
                    opensAt: "09:00"
                    firstCome: issue
                    priority: 6
                  - id: coupangeats-open-20260922-17시-두찜
                    group: coupangeats-open-20260922
                    brand: 두찜
                    platform: coupangeats
                    url: "https://example.test/hub"
                    amount: {won: 7000}
                    startsAt: 2026-09-22T00:00:00
                    endsAt: 2026-09-22T23:59:59
                    opensAt: "17:00"
                    firstCome: issue
                    priority: 7
                """;
        List<Banner> active = catalog(yml).active();
        assertEquals(1, active.size(), "여는 시각이 달라도 한 장");
        Banner card = active.get(0);
        assertEquals(List.of("09:00", "17:00"), card.members().stream().map(Banner.Member::opensAt).toList());
        assertEquals("9월 22일 하루", card.period());
        assertEquals("발급 선착순", card.extra());
        assertNull(BannerCatalog.groupRuleBreak(catalog(yml).activeMembers()));
    }

    @Test
    void sameOpeningTimeGroupKeepsItsClockPeriod() {
        String yml = TWO_IN_A_GROUP.replace("priority: 5", "priority: 5\n    opensAt: \"11:00\"")
                .replace("priority: 2", "priority: 2\n    opensAt: \"11:00\"");
        Banner card = catalog(yml).active().get(0);
        assertEquals("오전 11시 오픈", card.period());
        assertEquals(List.of("11:00", "11:00"), card.members().stream().map(Banner.Member::opensAt).toList());
    }

    @Test
    void cardIsSoldOutOnlyWhenEveryMemberIsSoldOut() {
        // 대표만 소진이면 카드 전체가 소진으로 뜨고, 다른 구성원만 소진이면 표시가 없었다
        // (감사 2026-09-29 #6). 카드는 전원일 때만, 누가 소진인지는 members가 말한다.
        String leadOnly = TWO_IN_A_GROUP.replace("minOrder: 18000", "minOrder: 18000\n    soldOut: true");
        Banner card = catalog(leadOnly).active().get(0);
        assertEquals(false, card.soldOut(), "구성원 하나만 소진이면 카드는 소진이 아니다");
        assertEquals(List.of(true, false), card.members().stream().map(Banner.Member::soldOut).toList());

        String both = leadOnly.replace("minOrder: 15000", "minOrder: 15000\n    soldOut: true");
        assertEquals(true, catalog(both).active().get(0).soldOut(), "전원 소진이면 카드도 소진이다");
    }

    @Test
    void membersCarryOnlyWhatMayDifferBetweenThem() {
        // 묶음은 링크, 기간, 플랫폼이 같다(확정 규칙 4절, 2026-09-29 사용자 결정). 그 셋은 카드의
        // 것이고, 구성원은 브랜드, 금액, 최소주문(과 소진)만 따로 싣는다.
        Banner card = catalog(TWO_IN_A_GROUP).active().get(0);
        assertEquals("https://example.test/doubleday", card.url());
        assertEquals(List.of("피자알볼로", "던킨"), card.members().stream().map(Banner.Member::brand).toList());
        assertEquals(List.of("8,000원", "7,000원"), card.members().stream().map(Banner.Member::amount).toList());
        assertEquals(List.of(18000, 15000), card.members().stream().map(Banner.Member::minOrder).toList());
    }

    @Test
    void groupWithDifferentLinksIsNotMergedButShownSeparately() {
        // 링크가 다른데 접으면 카드는 대표 링크 하나라 다른 브랜드를 누른 사람이 엉뚱한 곳으로
        // 간다. 조용히 접지 않고 구성원을 각자 한 장으로 둔다(경고는 로그에 남는다).
        String yml = TWO_IN_A_GROUP.replaceFirst("https://example.test/doubleday", "https://example.test/dunkin");
        List<Banner> active = catalog(yml).active();
        assertEquals(2, active.size(), "규칙을 어긴 묶음은 접지 않는다");
        assertTrue(active.stream().allMatch(b -> b.members() == null), "접지 않은 카드에는 members가 없다");
        assertEquals(java.util.Set.of("https://example.test/dunkin", "https://example.test/doubleday"),
                active.stream().map(Banner::url).collect(java.util.stream.Collectors.toSet()));
    }

    @Test
    void groupWithDifferentPeriodsIsNotMerged() {
        String yml = TWO_IN_A_GROUP.replaceFirst("endsAt: 2026-09-22T23:59", "endsAt: 2026-09-23T23:59");
        assertEquals(2, catalog(yml).active().size(), "기간이 다르면 접지 않는다");
    }

    @Test
    void groupWithDifferentPlatformsIsNotMerged() {
        String yml = TWO_IN_A_GROUP.replaceFirst("platform: ddangyo", "platform: baemin");
        assertEquals(2, catalog(yml).active().size(), "플랫폼이 다르면 접지 않는다");
    }

    @Test
    void groupRuleBreakNamesTheField() {
        Banner a = Banner.of("a", "https://x").platform("baemin")
                .startsAt(java.time.LocalDateTime.parse("2026-09-22T00:00"))
                .endsAt(java.time.LocalDateTime.parse("2026-09-22T23:59:59")).build();
        assertNull(BannerCatalog.groupRuleBreak(List.of(a, a.toBuilder().brand("다른").build())),
                "브랜드만 다르면 지킨 것이다");
        assertEquals("링크(url)", BannerCatalog.groupRuleBreak(List.of(a, Banner.of("b", "https://y")
                .platform("baemin").startsAt(a.startsAt()).endsAt(a.endsAt()).build())));
        assertEquals("기간(startsAt/endsAt)", BannerCatalog.groupRuleBreak(List.of(a,
                a.toBuilder().startsAt(java.time.LocalDateTime.parse("2026-09-21T00:00")).build())));
        assertEquals("플랫폼(platform)", BannerCatalog.groupRuleBreak(List.of(a, a.toBuilder().platform("yogiyo").build())));
    }
}
