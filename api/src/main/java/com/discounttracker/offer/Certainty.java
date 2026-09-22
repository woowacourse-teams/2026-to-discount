package com.discounttracker.offer;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 이 금액을 액면대로 견줄 수 있나.
 *
 * <p>{@code qualifier} 한 칸이 겸하던 세 질문 중 하나다. 나머지 둘은 {@code tierMode}
 * (겹침)와 {@code fromBanner}(출처)가 이미 답하고 있다.
 *
 * <p>원장(덧붙이기만 하는 {@code data/log.jsonl})은 안 고친다. 옛 행의 {@code qualifier}에서
 * 읽을 때 끌어낸다 - 대응이 빠짐없이 채워져서 잃는 값이 없다.
 */
public enum Certainty {

    /** 적힌 값을 그대로 받는다. */
    EXACT("exact"),
    /** 최소주문금액을 채워야 나오는 상한액. 화면 배지는 "불확정"이다. */
    CAPPED("capped"),
    /** 뽑기. 받는 사람마다 값이 다르다. */
    RANDOM("random"),
    /** 메뉴 하나에만 쓴다. */
    MENU_ONLY("menuOnly"),
    /** 정률이라 주문 금액을 모르면 얼마인지 안 정해진다. */
    PERCENT("percent");

    private final String key;

    Certainty(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }

    /**
     * 원장 {@code qualifier}에서 끌어낸다. 모르는 값은 {@link #EXACT}다.
     *
     * <p>"최적"과 "최소"는 겹침 축({@code tierMode})이 이미 답하는 사실이라 확실성으로는
     * 그냥 확정이다. "행사"는 출처 축({@code fromBanner})이 답한다.
     */
    public static Certainty fromQualifier(String qualifier) {
        if (qualifier == null) return EXACT;
        return switch (qualifier) {
            case "최대" -> CAPPED;
            case "랜덤" -> RANDOM;
            case "특정메뉴" -> MENU_ONLY;
            default -> EXACT;
        };
    }
}
