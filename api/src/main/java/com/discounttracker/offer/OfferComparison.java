package com.discounttracker.offer;

/**
 * 오퍼를 견주는 두 질문의 유일한 답.
 *
 * <p>질문이 둘이라는 것이 요점이다. 한때 "한 규칙"으로 합치려 했는데 합치면 안 된다.
 *
 * <ul>
 *   <li>최고 할인 후보인가: 확정이고 할인이고 안 나갔나</li>
 *   <li>카드 정렬에 얼마로 기여하나: 액면, 눌린 값, 또는 제외</li>
 * </ul>
 *
 * <p>특정 메뉴 한정 쿠폰이 둘을 가르는 사례다. 최고 후보에서는 빠지지만 정렬에서는
 * 4,999원으로 남는다 - 통째로 빼면 그 쿠폰밖에 없는 브랜드가 근거를 잃는다.
 *
 * <p>웹의 {@code filters.js}가 같은 규칙을 들고 있다. 판정표
 * {@code docs/contracts/certainty-cases.json}을 양쪽 테스트가 같이 읽어 어긋남을 막는다(ADR-016).
 */
public final class OfferComparison {

    private OfferComparison() {
    }

    /**
     * 특정 메뉴 한정 쿠폰이 정렬에서 갖는 값.
     *
     * <p>5,000원 바로 아래다. 일반 할인 5,000원짜리를 절대 못 넘고 그보다 작은 일반
     * 할인보다는 위에 선다.
     */
    public static final int MENU_LIMITED_SORTING_AMOUNT = 4999;

    /** 카드의 "최고 할인"으로 세울 수 있는 값인가. */
    public static boolean isBestCandidate(Certainty certainty, AmountKind kind, boolean soldOut) {
        return certainty == Certainty.EXACT && kind == AmountKind.DISCOUNT && !soldOut;
    }

    /** 카드 정렬에 기여하는 금액. 견줄 수 없으면 null이라 아예 안 들어간다. */
    public static Integer sortingAmount(Certainty certainty, Integer amount) {
        return switch (certainty) {
            case MENU_ONLY -> MENU_LIMITED_SORTING_AMOUNT;
            case CAPPED, RANDOM, PERCENT -> null;
            case EXACT -> amount;
        };
    }
}
