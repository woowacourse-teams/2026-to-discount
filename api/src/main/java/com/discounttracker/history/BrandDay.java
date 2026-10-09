package com.discounttracker.history;

import java.time.LocalDate;

/** 하루 한 쌍(플랫폼, 브랜드)의 상태와 금액. */
public record BrandDay(LocalDate date, String platform, String brand, DayState state, WithheldReason reason, Integer max) {

    /** 그날 그 쌍을 실제로 봤다고 칠 수 있는가. 직전 수집일 판정에 쓴다. */
    public boolean collected() {
        return switch (state) {
            case PUBLISHED, ABSENT -> true;
            case WITHHELD -> reason != null && reason.countsAsCollected();
            default -> false;
        };
    }

    /** 믿을 수 있는 그날 금액. 없으면 null. */
    public Integer trustedAmount() {
        if (state == DayState.PUBLISHED) return max;
        if (state == DayState.WITHHELD && reason != null && reason.trustsValue()) return max;
        return null;
    }

    boolean untrusted() {
        return state == DayState.UNCOLLECTED || state == DayState.UNKNOWN
                || (state == DayState.WITHHELD && (reason == null || !reason.trustsValue()));
    }
}
