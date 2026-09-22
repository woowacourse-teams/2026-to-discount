package com.discounttracker.offer;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 무엇을 주는가. 가르는 기준은 "받은 값을 어디서 쓸 수 있나" 하나다.
 *
 * <p>원장에서 온 오퍼는 전부 {@link #DISCOUNT}다. 수집기가 이 값을 적은 적이 없다.
 * 배너만 다른 값을 만든다.
 */
public enum AmountKind {

    /** 결제할 금액이 지금 깎인다. */
    DISCOUNT("discount"),
    /** 결제 수단이 나중에 돌려준다. 그 수단이 닿는 곳이면 어디서든 쓴다. */
    CASHBACK("cashback"),
    /** 그 브랜드나 그 앱 안에서만 쓰는 적립금. */
    POINTS("points");

    private final String key;

    AmountKind(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }

    /** 배너 파일의 문자열에서. 비었거나 모르면 {@link #DISCOUNT}다. */
    public static AmountKind from(String raw) {
        if (raw == null || raw.isBlank()) return DISCOUNT;
        for (AmountKind k : values()) {
            if (k.key.equals(raw.trim())) return k;
        }
        return DISCOUNT;
    }
}
