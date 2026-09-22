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
    void unknownQualifierIsExactRatherThanNull() {
        // 모르는 값에 null을 돌려주면 부르는 쪽마다 분기가 생긴다. 원장이 허용하는 값은
        // schema.py의 ALLOWED_QUALIFIERS 다섯이고 그 밖은 들어올 일이 없다.
        assertEquals(Certainty.EXACT, Certainty.fromQualifier("듣도보도못한값"));
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
