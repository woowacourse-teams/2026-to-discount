package com.discounttracker.banner;

import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
 * @param minOrder 최소주문금액. 적어두면 이 배너가 오퍼로 설 때 조건으로
 *                 함께 들어간다. 안 적으면 {@code extra}에서 도로 뽑는다
 *                 ({@link #effectiveMinOrder()}) — 사람이 둘 다 적는 일이 거의
 *                 없어서 이 칸만 비운 배너가 계속 나왔다.
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

    /**
     * {@code extra}의 "18,900원↑" / "18,900원 이상"에서 앞 숫자.
     *
     * <p>맨 앞 금액만 본다. "25,000원↑, 고정 6,000+선착순 4,000"처럼 뒤에
     * 다른 금액이 따라붙는 문구가 흔하다 — 그것까지 잡으면 할인액을
     * 최소주문금액으로 읽는다.
     */
    private static final Pattern EXTRA_MIN_ORDER = Pattern.compile(
            // 맨 앞의 "18,900원↑" / "18,900원 이상"
            "^\\s*([0-9][0-9,]*)\\s*원\\s*(?:↑|이상)"
            // 또는 어디에 있든 "최소주문 20,000원" — 말로 밝힌 경우
            + "|최소주문\\s*([0-9][0-9,]*)\\s*원");

    /**
     * 오퍼 조건으로 쓸 최소주문금액. 명시로 적은 값이 먼저다.
     *
     * <p>배너를 올리는 사람은 {@code extra}에 "16,000원↑"를 적고 끝낸다.
     * 실측(2026-08-25)으로 살아 있는 배너 셋 전부가 extra에는 금액을
     * 적고 minOrder는 비워 두어, 카드에 선 오퍼가 전부 "최소주문 미확인"
     * 이었다. 그 문장을 몸도 읽게 해서 손으로 두 번 적는 일을 없앱니다.
     */
    public Integer effectiveMinOrder() {
        if (minOrder != null) return minOrder;
        if (extra == null) return null;
        Matcher m = EXTRA_MIN_ORDER.matcher(extra);
        if (!m.find()) return null;
        String digits = m.group(1) != null ? m.group(1) : m.group(2);
        try {
            return Integer.valueOf(digits.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** {@code startsOn <= day <= endsOn}. 경계일 자신도 포함이다. */
    boolean activeOn(LocalDate day) {
        return !day.isBefore(startsOn) && !day.isAfter(endsOn);
    }
}
