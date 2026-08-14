package com.discounttracker.offer;

/**
 * 주문금액 구간별 차등 할인 한 칸 — "{@code minOrder}원 이상 주문 시 {@code amount}원".
 *
 * <p>목록 화면의 "최대 n원"이 실제로 무엇인지는 여기에 있다. 구간이 채워지면
 * 그 중 가장 큰 {@code amount}가 곧 그 "최대 n원"이다.
 *
 * <p>{@code percent}는 정률+상한 할인(예: "5%, 최대 3,000원")일 때만 채워지고,
 * 그때 {@code cap}이 그 상한액을 든다. {@code amount}는 어느 tier에서든
 * <b>이 문턱에서 실제 받는 금액</b>이다 — 정률이면 {@code minOrder × percent}를
 * 원 단위로 내린 값이고, {@code cap}에는 문턱보다 훨씬 큰 주문에서야 닿는다
 * (굽네치킨 요기요: 25,000원에 1,250원, 3,000원 상한은 60,000원 주문). 예전엔
 * {@code amount}가 상한을 겸해 정액 tier와 뜻이 달랐고 실제로 오독을 낳았다
 * (ADR-019).
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
public record DiscountTier(Integer minOrder, Integer amount, Integer percent, Integer cap,
                           String channel, Boolean soldOut, String expiresAt) {
}
