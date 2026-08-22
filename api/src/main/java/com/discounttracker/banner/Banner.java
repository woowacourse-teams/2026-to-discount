package com.discounttracker.banner;

import java.time.LocalDate;

/**
 * 화면 맨 위에 띄우는 당일 행사 한 건.
 *
 * <p>원장(export.json)에서 파생되지 않는다. "당일 행사·특별 할인"은 정의상
 * 상시 오퍼 목록에 없는 것을 알리는 자리라, 오퍼 데이터에 묶으면 정작
 * 띄우고 싶은 앱 전체 이벤트나 첫 주문 쿠폰을 못 띄운다. 사람이
 * {@code banners.yml}에 직접 적는다.
 *
 * @param brand    브랜드 대표명. 없으면(null) 앱 전체 행사다.
 * @param platform 원장 platform 값과 같은 키(baemin, coupangeats, ...).
 *                 배지와 색 폴백이 이 값을 쓴다.
 * @param amount   정수가 아니라 문자열이다 — "첫 주문 5,000원", "최대 30%"
 *                 같은 것을 담아야 하는데 정수로 두면 못 담고, 그러면 배너를
 *                 원장에서 떼어낸 이유가 사라진다.
 * @param period   금액 우측 상단에 붙는 기간 문구("8/11 하루만").
 * @param extra    부가 조건. 없으면 null이고 화면에서 그 줄이 사라진다.
 * @param minOrder 최소주문금액. 선택이지만 적어두면 이 배너가 오퍼로 설 때
 *                 조건으로 함께 들어간다. {@code extra}에 "18,000원↑"이라고
 *                 적어도 그건 사람이 읽는 문장일 뿐이라, 오퍼 상세의 조건
 *                 칸은 빈 채로 "최소주문 미확인"이 뜬다.
 * @param color    브랜드색 강제 지정. 없으면 로고에서 뽑고, 그마저 실패하면
 *                 플랫폼 색으로 간다(프론트 brandColor.js).
 * @param priority 낮을수록 먼저. 안 적으면 {@link #DEFAULT_PRIORITY}.
 */
public record Banner(
        String id,
        String brand,
        String platform,
        String url,
        String amount,
        String period,
        String extra,
        Integer minOrder,
        String color,
        LocalDate startsOn,
        LocalDate endsOn,
        int priority) {

    static final int DEFAULT_PRIORITY = 999;

    /** {@code startsOn <= day <= endsOn}. 경계일 자신도 포함이다. */
    boolean activeOn(LocalDate day) {
        return !day.isBefore(startsOn) && !day.isAfter(endsOn);
    }
}
