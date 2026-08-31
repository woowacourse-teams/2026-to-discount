package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

class SurveyTextTest {

    @Test
    void keepsOrdinaryText() {
        assertEquals("배달비가 비싸서 씁니다", SurveyText.clean("배달비가 비싸서 씁니다"));
    }

    @Test
    void stripsPhoneNumbers() {
        String out = SurveyText.clean("연락처 010-1234-5678 로 주세요");
        assertFalse(out.contains("010-1234-5678"));
        assertFalse(out.contains("1234"));
    }

    /** 하이픈 없이 붙여 쓴 것도 잡아야 한다. */
    @Test
    void stripsPhoneNumbersWithoutHyphens() {
        assertFalse(SurveyText.clean("01012345678").contains("01012345678"));
    }

    @Test
    void stripsEmails() {
        assertFalse(SurveyText.clean("me@example.com 으로 보내줘").contains("@example.com"));
    }

    @Test
    void stripsResidentNumbers() {
        assertFalse(SurveyText.clean("900101-1234567").contains("1234567"));
    }

    @Test
    void capsAt200Characters() {
        String out = SurveyText.clean("가".repeat(500));
        assertEquals(200, out.length());
    }

    @Test
    void nullStaysNull() {
        assertNull(SurveyText.clean(null));
    }

    /** 하이픈 없이 붙여 쓴 주민번호. 구분자를 필수로 두면 이게 통째로 빠져나간다. */
    @Test
    void stripsResidentNumbersWithoutSeparator() {
        assertFalse(SurveyText.clean("9112253456789").contains("9112253456789"));
    }

    /** 금액이 섞인 정상 문장은 건드리지 않는다. 뭉개면 설문을 한 이유가 사라진다. */
    @Test
    void keepsAmountsInOrdinaryText() {
        assertEquals("20,000원 이상 3,000원 할인",
                SurveyText.clean("20,000원 이상 3,000원 할인"));
    }
}
