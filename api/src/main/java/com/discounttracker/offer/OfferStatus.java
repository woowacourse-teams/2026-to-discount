package com.discounttracker.offer;

/**
 * 이 금액을 믿어도 되는가.
 *
 * <p>전에는 {@code "confirmed"}/{@code "held"} 문자열을 그대로 들고 다니며
 * {@code equals}로 비교했다. 이 값과 {@code qualifier}("최대")를 혼동해
 * 화면에 배지가 잘못 뜬 적이 있어(땡겨요는 확정인데 "최대" 표기가 남아
 * 있다) 타입으로 분리한다. 두 값은 직교한다 — 확정이면서 "최대"일 수 있다.
 */
public enum OfferStatus {
    /** 금액이 있고 재확인도 필요 없다. 그대로 보여줘도 되는 값. */
    CONFIRMED,
    /** 금액이 없거나 재확인이 필요하다(요기요 쿠폰함처럼 실적용가를 못 읽은 경우). */
    HELD;

    public boolean isConfirmed() {
        return this == CONFIRMED;
    }

    /** JSON으로 나갈 때는 프론트가 쓰던 소문자 키를 유지한다. */
    public String key() {
        return name().toLowerCase();
    }
}
