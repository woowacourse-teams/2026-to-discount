package com.discounttracker.offer;

/**
 * 이 오퍼를 받으려면 필요한 앱 유료 멤버십.
 *
 * <p>전에는 이 정보가 {@code badge} 자유 텍스트("배민클럽", "쿠팡와우 전용쿠폰")
 * 에만 있었다 — 화면에 찍히는 문구와 필터링 가능한 값이 섞여 있었다는 뜻이다.
 * {@code badge}는 문구 그대로 유지하고, 이 값이 구조화된 쪽이다.
 *
 * <p>{@link #NONE}이 기본값이고 일반 사용자도 받을 수 있다는 뜻이다 —
 * {@code sold_out}·{@code needs_review}처럼 필드 부재가 "확인 안 됨"이 아니라
 * "제한 없음"이다({@code tracker/schema.py}의 {@code ALLOWED_MEMBERSHIP} 주석 참고).
 */
public enum Membership {
    NONE,
    BAEMIN_CLUB,
    COUPANG_EATS,
    YOGI_PASS;

    /** export.json의 camelCase 값을 enum으로. 모르는 값이거나 없으면 NONE. */
    public static Membership from(String raw) {
        if (raw == null || raw.isBlank()) {
            return NONE;
        }
        return switch (raw) {
            case "baeminClub" -> BAEMIN_CLUB;
            case "coupangEats" -> COUPANG_EATS;
            case "yogiPass" -> YOGI_PASS;
            default -> NONE;
        };
    }

    /** JSON으로 나갈 때는 tracker와 같은 camelCase 키로. */
    public String key() {
        return switch (this) {
            case NONE -> "none";
            case BAEMIN_CLUB -> "baeminClub";
            case COUPANG_EATS -> "coupangEats";
            case YOGI_PASS -> "yogiPass";
        };
    }
}
