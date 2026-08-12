package com.discounttracker.brand;

/**
 * 브랜드 분류. 프론트 카테고리 필터가 이 값을 그대로 쓴다.
 *
 * <p>모든 브랜드가 여기 속하지는 않는다 — 아직 카테고리를 안 만든 브랜드는
 * {@code null}로 두고 "전체"에서만 노출한다. 억지로 분류하느니 비워두는
 * 편이 낫다.
 */
public enum Category {
    CHICKEN,
    PIZZA,
    FASTFOOD,
    SNACK,
    CAFE,
    CONVENIENCE,
    KOREAN,
    CHINESE;

    /** brands.yml의 소문자 표기를 enum으로. 모르는 값이면 null(미분류). */
    public static Category from(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** JSON으로 나갈 때는 프론트가 쓰는 소문자 키로. */
    public String key() {
        return name().toLowerCase();
    }
}
