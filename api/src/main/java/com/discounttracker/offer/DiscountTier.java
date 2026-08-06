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
 *
 * <p>{@code soldOut}은 이 구간이 지금 재고 소진으로 못 받는 상태일 때만
 * {@code true}. 카드 대표값({@link Offer#amount()})은 절대 품절 구간에서
 * 뽑지 않는다 — 원장 쪽에서 이미 살아있는 구간을 대표로 골라 넣는다
 * (쿠팡이츠 메가MGC커피 실측, 2026-08-03).
 *
 * <p>{@code expiresAt}(YYYY-MM-DD)은 이 구간만 따로 끝날 때 채운다. 한 브랜드에
 * 걸린 쿠폰들이 같은 날 끝난다는 보장이 없다 — 청년피자 땡겨요는 상시 5,000원과
 * 하루짜리 청피데이 9,000원이 한 레코드에 같이 있었고, 청피데이가 끝난
 * 2026-08-06에 레코드 단위 만료일만 보고 살아있는 5,000원까지 통째로 내려버렸다.
 * 비어 있으면 레코드의 {@link Offer#expiresAt()}를 따른다.
 */
public record DiscountTier(Integer minOrder, Integer amount, Integer percent, String channel,
                           Boolean soldOut, String expiresAt) {
}
