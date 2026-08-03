package com.discounttracker.offer;

/**
 * 주문금액 구간별 차등 할인 한 칸 — "{@code minOrder}원 이상 주문 시 {@code amount}원".
 *
 * <p>목록 화면의 "최대 n원"이 실제로 무엇인지는 여기에 있다. 구간이 채워지면
 * 그 중 가장 큰 {@code amount}가 곧 그 "최대 n원"이다.
 *
 * <p>{@code percent}는 정률+상한 할인(예: "5%, 최대 3,000원")일 때만 채워진다.
 * 정액이든 정률+상한이든 {@code amount}는 항상 "이 구간 최대 할인액(원)"을
 * 뜻하는 규칙은 그대로다 — {@code percent} 유무로 정액/정률만 구분한다.
 *
 * <p>{@code channel}은 같은 {@code minOrder}에 {@code amount}만 다른 두 구간이
 * 실은 구간 할인이 아니라 배달/포장/매장식사별로 금액이 다른 별개 쿠폰일 때만
 * 채워진다(땡겨요 바른치킨·도미노피자 실측, 2026-08-01).
 */
public record DiscountTier(Integer minOrder, Integer amount, Integer percent, String channel) {
}
