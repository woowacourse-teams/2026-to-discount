package com.discounttracker.offer;

/**
 * 이 오퍼를 받으려면 필요한 앱 유료 멤버십.
 *
 * <p>전에는 이 정보가 {@code badge} 자유 텍스트("배민클럽", "쿠팡와우 전용쿠폰")
 * 에만 있었다 — 화면에 찍히는 문구와 필터링 가능한 값이 섞여 있었다는 뜻이다.
 * {@code badge}는 문구 그대로 유지하고, 이 값이 구조화된 쪽이다.
 *
 * <p>{@link #UNKNOWN}이 기본값이고 "이 화면에선 안 보인다"는 뜻이다.
 * {@link #NONE}은 봤는데 제한이 없더라는 관측이다. 쿠폰함엔 표시가 있고
 * (쿠팡 [와우회원전용], 배민 배민클럽 배지) 허브 카드·브랜드관 목록엔 없다 —
 * 표시 없는 화면이 "none"을 적으면 쿠폰함 관측을 덮는다
 * ({@code tracker/schema.py}의 {@code ALLOWED_MEMBERSHIP} 주석 참고).
 * JSON으로는 둘 다 "none"으로 나간다 — 화면은 배지를 안 그리면 그만이고,
 * 구분이 필요한 곳은 아직 없다.
 */
public enum Membership {
    UNKNOWN,
    NONE,
    BAEMIN_CLUB,
    COUPANG_EATS,
    YOGI_PASS;

    /** export.json의 camelCase 값을 enum으로. 없으면 UNKNOWN, "none"이면 NONE. */
    public static Membership from(String raw) {
        if (raw == null || raw.isBlank()) {
            return UNKNOWN;
        }
        return switch (raw) {
            case "none" -> NONE;
            case "baeminClub" -> BAEMIN_CLUB;
            case "coupangEats" -> COUPANG_EATS;
            case "yogiPass" -> YOGI_PASS;
            default -> UNKNOWN;
        };
    }

    /**
     * 덜 제한적인 순. 구간에서 오퍼 값을 유도할 때 가장 작은 것을 고른다
     * (ADR-029). tracker {@code schema.MEMBERSHIP_ORDER}와 같은 순서다 —
     * enum 선언 순서에 기대지 않는다.
     */
    public int restriction() {
        return switch (this) {
            case UNKNOWN -> -1;
            case NONE -> 0;
            case YOGI_PASS -> 1;
            case BAEMIN_CLUB -> 2;
            case COUPANG_EATS -> 3;
        };
    }

    /** JSON으로 나갈 때는 tracker와 같은 camelCase 키로. */
    public String key() {
        return switch (this) {
            case UNKNOWN, NONE -> "none";
            case BAEMIN_CLUB -> "baeminClub";
            case COUPANG_EATS -> "coupangEats";
            case YOGI_PASS -> "yogiPass";
        };
    }
}
