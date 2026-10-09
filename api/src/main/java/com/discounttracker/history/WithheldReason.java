package com.discounttracker.history;

import java.util.Locale;

/** 보류 사유. 값을 믿을 수 있는 사유만 직전 수집일로 친다(설계 "보류 사유" 표). */
public enum WithheldReason {
    HELD_HUMAN(true), REJECTED(false), STAGE_SUSPECT(false), MISREAD(false), EXPIRED(true);

    private final boolean trusts;

    WithheldReason(boolean trusts) { this.trusts = trusts; }

    public boolean trustsValue() { return trusts; }

    public boolean countsAsCollected() { return trusts; }

    public static WithheldReason of(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return valueOf(s.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null; // 모르는 사유는 사유 없음으로 둔다
        }
    }

    public String key() { return name().toLowerCase(Locale.ROOT); }
}
