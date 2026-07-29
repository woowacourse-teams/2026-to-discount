package com.discounttracker.offer;

/**
 * 주문금액 구간별 차등 할인 한 칸 — "{@code minOrder}원 이상 주문 시 {@code amount}원".
 *
 * <p>목록 화면의 "최대 n원"이 실제로 무엇인지는 여기에 있다. 구간이 채워지면
 * 그 중 가장 큰 {@code amount}가 곧 그 "최대 n원"이다.
 */
public record DiscountTier(Integer minOrder, Integer amount) {
}
