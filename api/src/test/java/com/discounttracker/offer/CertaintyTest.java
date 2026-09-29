package com.discounttracker.offer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** 옛 qualifier에서 certainty로 가는 대응이 빠짐없이 채워지는가. */
class CertaintyTest {

    @Test
    void everyLedgerQualifierMapsToExactlyOneCertainty() {
        assertEquals(Certainty.CAPPED, Certainty.fromQualifier("최대"));
        assertEquals(Certainty.RANDOM, Certainty.fromQualifier("랜덤"));
        assertEquals(Certainty.MENU_ONLY, Certainty.fromQualifier("특정메뉴"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("최적"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("최소"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("행사"));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier(null));
    }

    @Test
    void blankQualifierIsExact() {
        // 확정 규칙 5절: null, 빈 문자열, 공백은 "조건 없음"이라 확정이다.
        assertEquals(Certainty.EXACT, Certainty.fromQualifier(""));
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("  "));
    }

    @Test
    void unknownQualifierIsNeverExact() {
        // 2026-09-29 백로그 #5. 모르는 조건을 EXACT로 두면 견줄 수 없는 금액이 최고 할인
        // 후보로 선다. 확정 규칙 5절이 예외 경로를 금하므로 던지지 않고, 가장 보수적인
        // CAPPED(최고 후보 아님, 정렬 기여 없음, 화면 "불확정")로 둔다.
        assertEquals(Certainty.CAPPED, Certainty.fromQualifier("듣도보도못한값"));
    }

    @Test
    void keysAreTheJsonSpelling() {
        assertEquals("exact", Certainty.EXACT.key());
        assertEquals("menuOnly", Certainty.MENU_ONLY.key());
        assertEquals("percent", Certainty.PERCENT.key());
        assertEquals("discount", AmountKind.DISCOUNT.key());
        assertEquals("cashback", AmountKind.CASHBACK.key());
        assertEquals("points", AmountKind.POINTS.key());
    }

    @Test
    void amountKindDefaultsToDiscount() {
        // 원장에서 온 오퍼는 전부 할인이다. 수집기가 kind를 적은 적이 없다.
        assertEquals(AmountKind.DISCOUNT, AmountKind.from(null));
        assertEquals(AmountKind.DISCOUNT, AmountKind.from(""));
        assertEquals(AmountKind.CASHBACK, AmountKind.from("cashback"));
        assertEquals(AmountKind.POINTS, AmountKind.from("points"));
    }
}
