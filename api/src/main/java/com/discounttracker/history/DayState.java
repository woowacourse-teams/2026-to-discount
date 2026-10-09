package com.discounttracker.history;

import java.util.Locale;

/** 하루 상태(설계 2026-10-09). 브랜드와 플랫폼마다 날짜별로 하나다. */
public enum DayState {
    PUBLISHED, WITHHELD, UNCOLLECTED, ABSENT, UNKNOWN;

    public static DayState of(String s) {
        return s == null ? UNKNOWN : valueOf(s.toUpperCase(Locale.ROOT));
    }
}
