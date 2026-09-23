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
     *
     * <p>"정률"은 원장(schema.py ALLOWED_QUALIFIERS)에는 없는 값이다 - 배너의 구조 필드
     * (amount.percent)에서만 나온다(Task 8). {@code BrandComparisonService.qualifierOf}가
     * {@link #PERCENT}를 이행 기간 동안 이 문자열로 실어 보내고, 여기서 되짚는다.
     *
     * <p><b>옛 모양 전용 다리(RULES 11, Task 19).</b> 지울 수 있는 조건이 다른 셋과
     * 다르다 - {@code data/log.jsonl}은 덧붙이기 전용 원장이라(RULES 5) 옛 {@code qualifier}
     * 행이 지워지지 않고 영원히 남는다. 즉 "라이브에 옛 모양이 없어지면 지운다"는
     * 조건이 여기서는 사실상 성립하지 않는다 - 원장을 다시 쓰지 않는 한 이 다리는
     * 계속 산다. 몇 건이 이 다리를 타는지는 {@code data/log.jsonl}에서
     * {@code grep -c '"qualifier"' data/log.jsonl}로 센다 - qualifier가 있는 행 전부가
     * 이 다리를 거쳐야 certainty가 나온다. 원장이 덧붙이기 전용인 한 이 수는 줄지
     * 않고, 그래서 이 다리는 사실상 지울 조건이 없다(다른 셋과 다름).
     */
    public static Certainty fromQualifier(String qualifier) {
        if (qualifier == null) return EXACT;
        return switch (qualifier) {
            case "최대" -> CAPPED;
            case "랜덤" -> RANDOM;
            case "특정메뉴" -> MENU_ONLY;
            case "정률" -> PERCENT;
            default -> EXACT;
        };
    }
}
