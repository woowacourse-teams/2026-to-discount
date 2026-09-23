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

    /** 배달앱 밖, 브랜드 자체 앱이나 사이트의 행사 - {@code Banner.OWN}과 같은 값이다.
     * offer 패키지가 banner 패키지에 기대지 않도록 문자열로 직접 둔다. */
    private static final String OWN_PLATFORM = "own";

    /**
     * 카드의 "최고 할인"으로 세울 수 있는 값인가.
     *
     * <p>{@code platform}은 저장하는 값이 아니라 매번 넘겨받는 값이다 - own은 그 브랜드를
     * 보는 사람에게는 고를 수 있는 값이라 카드에는 서지만(2026-09-22), 배달앱끼리 겨루는
     * "최고 할인" 자리에는 못 낀다. own 여부는 다른 축과 마찬가지로 매 호출마다 답할
     * 질문이지 이 값 자체의 성질이 아니다.
     */
    public static boolean isBestCandidate(Certainty certainty, AmountKind kind, boolean soldOut, String platform) {
        return certainty == Certainty.EXACT && comparable(kind, soldOut, platform);
    }

    /** 확실성을 빼고, 이 오퍼가 배달앱끼리 견주는 자리에 낄 수 있는 값인가. */
    private static boolean comparable(AmountKind kind, boolean soldOut, String platform) {
        return kind == AmountKind.DISCOUNT && !soldOut && !OWN_PLATFORM.equals(platform);
    }

    /** 카드 정렬에 기여하는 금액. 견줄 수 없으면 null이라 아예 안 들어간다. */
    public static Integer sortingAmount(Certainty certainty, Integer amount) {
        return switch (certainty) {
            case MENU_ONLY -> MENU_LIMITED_SORTING_AMOUNT;
            case CAPPED, RANDOM, PERCENT -> null;
            case EXACT -> amount;
        };
    }

    /**
     * 천장(maxConfirmed, maxHeld) 두 값 모두가 물어야 할 단 하나의 질문.
     *
     * <p>호출부가 둘로 나눠 묻던 것을 여기 하나로 모은다 - 나눠 두면 한쪽만
     * 고쳐도 안 터진다(2026-09-23, fix round 3). 규칙은 {@link #isBestCandidate}, {@link #comparable},
     * {@link #sortingAmount}를 그대로 불러 쓴다 - 판정표
     * {@code docs/contracts/certainty-cases.json}이 검사하는 코드가 실제로 도는
     * 코드여야 한다(2026-09-23, fix round 4).
     *
     * <p>own과 비할인, 품절은 확실성보다 먼저 뺀다. 확실성 갈래 안에서 빼면
     * own에 품절인 특정메뉴 행이 4,999원 천장을 세운다(2026-09-23 fix round 4).
     *
     * <p>{@code confirmed}가 false면 CAPPED("최대")도 금액을 낸다. maxHeld는
     * 확정 오퍼가 없는 브랜드끼리 줄 세우는 데만 쓰고, 거기서는 견주는 값이
     * 모두 똑같이 미확정이라 액면끼리 견줘도 뜻이 어긋나지 않는다. 빼면 상한
     * 보류 브랜드가 전부 0으로 묶여 삽입 순서로 흩어진다. RANDOM과 PERCENT는
     * 양쪽에서 계속 뺀다 - 뽑기와 정률은 금액이 아니다.
     */
    public static Integer comparisonAmount(Certainty certainty, AmountKind kind, boolean soldOut,
            String platform, Integer amount, boolean confirmed) {
        if (!comparable(kind, soldOut, platform)) return null;
        if (!confirmed && certainty == Certainty.CAPPED) return amount;
        return sortingAmount(certainty, amount);
    }
}
