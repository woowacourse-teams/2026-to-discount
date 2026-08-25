package com.discounttracker.comparison;

import com.discounttracker.brand.Brand;
import com.discounttracker.offer.Offer;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 브랜드 하나를 앱별로 비교한 결과. 화면의 카드 하나에 대응한다.
 *
 * <p>JSON으로 나가는 모양은 평평하다 — {@code name}, {@code category},
 * {@code searchAliases}, {@code links}, {@code maxConfirmedAmount},
 * {@code offers}. 내부에서 {@link Brand}를 들고 있다고 해서 응답까지 중첩되면
 * 프론트가 도메인 구조 변경에 끌려다니게 되므로, 내보낼 것만 골라 노출한다.
 *
 * @param maxHeldAmount 보류 오퍼 중 최고액. 확정이 없는 브랜드끼리 줄
 *                      세울 때만 쓰는 내부 값이라 응답에는 안 나간다.
 */
public record BrandComparison(
        @JsonIgnore Brand brand,
        Integer maxConfirmedAmount,
        @JsonIgnore Integer maxHeldAmount,
        List<Offer> offers) {

    /** 카드 제목·로고 파일명이 쓰는 대표명. */
    @JsonProperty("name")
    public String name() {
        return brand.name();
    }

    /** 프론트 카테고리 필터용. 미분류면 null. */
    @JsonProperty("category")
    public String categoryKey() {
        return brand.category() == null ? null : brand.category().key();
    }

    /** 사용자가 대표명을 찾을 때 입력할 수 있는 한국어·영문 별칭. */
    @JsonProperty("searchAliases")
    public List<String> searchAliases() {
        return brand.searchAliases();
    }

    /** 앱별 브랜드 쿠폰 바로가기. 플랫폼 키(ddangyo, baemin, ...) -> 링크. */
    @JsonProperty("links")
    public Map<String, String> links() {
        return brand.links();
    }

    private boolean hasConfirmed() {
        return maxConfirmedAmount != null;
    }

    /**
     * 확정 할인이 큰 브랜드부터. 확정이 아예 없는 브랜드는 전부 뒤로 밀고,
     * 그들끼리는 보류 금액이 큰 순으로 세운다.
     *
     * <p>확정 없는 브랜드를 뒤로 미는 건 "믿을 수 있는 큰 할인"이 이 화면의
     * 핵심 정보이기 때문이다. 보류 금액이 아무리 커도(배스킨라빈스 최대
     * 20,000원) 실제로 받을 수 있다는 보장이 없어 위로 올리면 오해를 준다.
     */
    public static Comparator<BrandComparison> byBestDiscount() {
        return Comparator
                .comparing((BrandComparison b) -> !b.hasConfirmed())
                .thenComparing(b -> -orZero(b.hasConfirmed()
                        ? b.maxConfirmedAmount : b.maxHeldAmount));
    }

    private static int orZero(Integer v) {
        return v == null ? 0 : v;
    }
}
