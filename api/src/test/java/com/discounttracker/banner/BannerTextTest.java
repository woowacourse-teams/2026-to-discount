package com.discounttracker.banner;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** 새 칸에서 만든 문구가 사람이 손으로 적던 문구와 글자까지 같은지. */
class BannerTextTest {

    private static Banner.Builder base() {
        return Banner.of("t", "https://example.test/x").brand("던킨").platform("ddangyo")
                .startsAt(LocalDateTime.of(2026, 9, 22, 0, 0))
                .endsAt(LocalDateTime.of(2026, 9, 22, 23, 59));
    }

    @Test
    void amountReadsLikeTheHandWrittenBanner() {
        assertEquals("7,000원", BannerText.amount(BannerAmount.of(Map.of("won", 7000))));
        assertEquals("최대 8,000원",
                BannerText.amount(BannerAmount.of(Map.of("won", Arrays.asList(null, 8000)))));
        assertEquals("1,000~8,000원",
                BannerText.amount(BannerAmount.of(Map.of("won", Arrays.asList(1000, 8000)))));
        assertEquals("30% 할인", BannerText.amount(BannerAmount.of(Map.of("percent", 30))));
        assertEquals("50% 적립",
                BannerText.amount(BannerAmount.of(Map.of("percent", 50, "kind", "cashback"))));
    }

    @Test
    void oneDayEventSaysTheDay() {
        Banner b = base().amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("9월 22일 하루", BannerText.period(b));
    }

    @Test
    void startAtSeventeenSaysSeventeen() {
        // 17시 오픈은 startsAt 한 칸으로 끝난다. opensAt은 매일 반복하는 행사에만 쓴다.
        Banner b = base().startsAt(LocalDateTime.of(2026, 9, 22, 17, 0))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("오후 5시 오픈", BannerText.period(b));
    }

    @Test
    void repeatingOpenTimeSaysEveryDay() {
        Banner b = base().endsAt(LocalDateTime.of(2026, 9, 30, 23, 59))
                .spec(new BannerSpec("11:00", null, null, null, null))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("매일 오전 11시 오픈", BannerText.period(b));
    }

    @Test
    void extraGathersMinOrderAndLimitsAndNote() {
        Banner b = base().minOrder(15000).firstCome("issue").untilSoldOut(true)
                .spec(new BannerSpec(null, "배달", null, "더블 땡데이", "일부 매장 제외"))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("더블 땡데이 / 15,000원↑, 발급 선착순, 소진 시 종료, 배달 한정, 일부 매장 제외",
                BannerText.extra(b));
    }

    @Test
    void conditionsDropTheMinOrderBecauseTheTierRowAlreadyShowsIt() {
        // 문턱은 오퍼 구간의 minOrder로 따로 뜬다. 조건 줄에 또 적으면 두 번 보인다.
        Banner b = base().minOrder(15000).firstCome("issue")
                .spec(new BannerSpec(null, "배달", null, "더블 땡데이", null))
                .amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("더블 땡데이 / 발급 선착순, 배달 한정", BannerText.conditions(b));
    }

    @Test
    void targetedSaysLimited() {
        // 아무나 받는 것이 아니라는 사실이 조건 줄에 남아야 한다.
        Banner b = base().targeted(true).amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertEquals("타겟딜, 한정", BannerText.conditions(b));
    }

    @Test
    void emptyBannerHasNoExtraLine() {
        Banner b = base().amountSpec(BannerAmount.of(Map.of("won", 7000))).build();
        assertNull(BannerText.extra(b));
        assertNull(BannerText.conditions(b));
    }
}
