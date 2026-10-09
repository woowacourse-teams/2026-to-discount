package com.discounttracker.history;

import java.util.Locale;

/** 하루 상태(설계 2026-10-09). 브랜드와 플랫폼마다 날짜별로 하나다. */
public enum DayState {
    PUBLISHED, WITHHELD, UNCOLLECTED, ABSENT, UNKNOWN;

    public static DayState of(String s) {
        if (s == null || s.isBlank()) return UNKNOWN;
        try {
            return valueOf(s.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return UNKNOWN; // 새 상태 문자열 하나로 이력 전체를 잃지 않는다
        }
    }
}
