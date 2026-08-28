package com.discounttracker.banner;

import java.time.LocalDate;
import java.util.List;
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
 * @param soldOut   기간 내내 다 나간 상태로 둘 때 켠다. 하루짜리 배너가
 *                  아니면 거의 쓸 일이 없다.
 * @param soldOutOn 그 날짜에만 다 나간 것으로 본다. 선착순은 매일 다시
 *                  풀리므로 보통 이쪽을 쓴다 — soldOut을 켜 두면 다음 날
 *                  아침에도 매진으로 떠서, 늦지 않았는데 늦었다고 말한다.
 *
 *                  배너를 내리지 않고 남기는 이유는 없어진 것과 다 나간
 *                  것이 다른 소식이기 때문이다 — "오늘은 늦었다"를 알아야
 *                  내일 일찍 온다.
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
        Boolean soldOut,
        LocalDate soldOutOn,
        int priority) {

    static final int DEFAULT_PRIORITY = 999;

    /** 그날 다 나갔나. 기간 전체를 덮는 soldOut과 그날치 soldOutOn 중 하나면 참. */
    public boolean soldOutOn(LocalDate today) {
        return Boolean.TRUE.equals(soldOut) || today.equals(soldOutOn);
    }

    /** 응답에는 오늘 기준으로 판정한 값 하나만 싣는다 — 프론트가 날짜를 다시 따지지 않게. */
    public Banner resolvedFor(LocalDate today) {
        boolean out = soldOutOn(today);
        return Boolean.valueOf(out).equals(soldOut) && soldOutOn == null
                ? this
                : new Banner(id, brand, platform, url, amount, period, extra, minOrder,
                        color, startsOn, endsOn, out, null, priority);
    }

    /**
     * {@code extra}의 "18,900원↑" / "18,900원 이상"에서 앞 숫자.
     *
     * <p>맨 앞 금액만 본다. "25,000원↑, 고정 6,000+선착순 4,000"처럼 뒤에
     * 다른 금액이 따라붙는 문구가 흔하다 — 그것까지 잡으면 할인액을
     * 최소주문금액으로 읽는다.
     *
     * <p>"원"은 있어도 되고 없어도 된다. 사람이 손으로 적는 칸이라 "16,000↑"
     * 처럼 빼고 쓰는 일이 실제로 있었고(2026-08-29 처갓집), 그때 조건이
     * 화면에서 "최소주문 미확인"으로 떴다. 화살표나 "이상"이 뒤따르는 것이
     * 최소주문금액이라는 신호지 "원"이 아니다.
     */
    private static final Pattern EXTRA_MIN_ORDER = Pattern.compile(
            // 맨 앞의 "18,900원↑" / "18,900원 이상" / "16,000↑"
            "^\\s*([0-9][0-9,]*)\\s*(?:원)?\\s*(?:↑|이상)"
            // 또는 어디에 있든 "최소주문 20,000원" — 말로 밝힌 경우
            + "|최소주문\\s*([0-9][0-9,]*)\\s*원?");

    /**
     * 오퍼 조건으로 쓸 최소주문금액. 명시로 적은 값이 먼저다.
     *
     * <p>배너를 올리는 사람은 {@code extra}에 "16,000원↑"를 적고 끝낸다.
     * 실측(2026-08-25)으로 살아 있는 배너 셋 전부가 extra에는 금액을
     * 적고 minOrder는 비워 두어, 카드에 선 오퍼가 전부 "최소주문 미확인"
     * 이었다. 그 문장을 몸도 읽게 해서 손으로 두 번 적는 일을 없앱니다.
     */
    public Integer effectiveMinOrder() {
        Integer fromText = minOrderFromExtra();
        return fromText != null ? fromText : minOrder;
    }

    private Integer minOrderFromExtra() {
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

    /** {@code amount}의 맨 앞 "n,nnn원". 정액이 아니면 null. */
    private static final Pattern HEADLINE = Pattern.compile("([0-9][0-9,]*)\\s*원");

    /**
     * "4,000+10%" — 정액 뒤에 정률이 붙는다.
     *
     * <p>두 자리에 다 나온다. amount의 괄호 안("6,500원(4,000+10%)")이기도
     * 하고 extra의 문장 안("고정 6,000+선착순 10%")이기도 하다. 사이의
     * 말("선착순 ")은 배너마다 달라 길이로만 제한한다.
     */
    private static final Pattern FIXED_PLUS_RATE =
            Pattern.compile("([0-9][0-9,]*)\\s*원?\\s*\\+\\s*\\D{0,6}?([0-9]{1,3})\\s*%");

    /** "고정 6,000+선착순 4,000" — 정액 두 장을 겹쳐 쓴다. */
    private static final Pattern FIXED_PLUS_FIXED =
            Pattern.compile("([0-9][0-9,]*)\\s*원?\\s*\\+\\s*\\D{0,6}?([0-9][0-9,]*)(?!\\s*%)");

    /**
     * 복합쿠폰을 구간으로 푸는다. 아니면 빈 목록.
     *
     * <p>요기요 배너는 한 칸에 쿠폰 두 장을 적어 보낸다 — 굽네치킨
     * "6,500원(4,000+10%)", 파파존스 "고정 6,000+선착순 10%". 대표값 하나로만
     * 둔 채 카드에 세우면, 선착순가 끝나 고정분만 남았을 때 사람이
     * 그걸 알 길이 없다.
     *
     * <p><b>정률분은 최소주문금액에서 계산해 amount에 넣는다.</b>
     * {@code DiscountLadder}가 amount만 더하고 percent를 다시 계산하지 않기
     * 때문이다("각 구간의 amount는 이미 그 문턱에서 실제 받는 금액").
     *
     * <p>대표값이 문턱에서의 합보다 크면 그건 상한이다 — 파파존스
     * 실측(2026-08-25)에서 "최대 10,000원"은 고정 6,000 + 정률 상한 4,000이었고,
     * 25,000원에서 실제 받는 것은 6,000 + 2,500 = 8,500이다. 상한을
     * {@code cap}으로 남기고 사다리는 보장되는 값을 낸다.
     *
     * <p>대표값이 합보다 작으면 문구를 잘못 읽은 것이다 — 지어내지 않고
     * 빈 목록을 돌려 대표값 하나로 둔다.
     */
    public List<com.discounttracker.offer.DiscountTier> compoundTiers() {
        Integer headline = headlineAmount();
        Integer min = effectiveMinOrder();
        if (headline == null || min == null) return List.of();

        Matcher rate = firstMatch(FIXED_PLUS_RATE);
        if (rate != null) {
            Integer fixed = digits(rate.group(1));
            Integer percent = digits(rate.group(2));
            if (fixed == null || percent == null || percent == 0) return List.of();
            int rated = min * percent / 100;
            if (headline < fixed + rated) return List.of();
            // 대표값이 더 크면 그 초과분이 정률의 상한이다. 같으면
            // 상한을 알 길이 없으니 붙이지 않는다.
            Integer cap = headline > fixed + rated ? headline - fixed : null;
            return List.of(
                    new com.discounttracker.offer.DiscountTier(min, fixed, null, null, null, null, null),
                    new com.discounttracker.offer.DiscountTier(min, rated, percent, cap, null, null, null));
        }

        Matcher two = firstMatch(FIXED_PLUS_FIXED);
        if (two != null) {
            Integer a = digits(two.group(1));
            Integer b = digits(two.group(2));
            if (a == null || b == null) return List.of();
            if (a + b != headline) return List.of();
            return List.of(
                    new com.discounttracker.offer.DiscountTier(min, a, null, null, null, null, null),
                    new com.discounttracker.offer.DiscountTier(min, b, null, null, null, null, null));
        }
        return List.of();
    }

    /** amount를 먼저 보고 extra를 본다. 둘 다 쓰이는 자리다. */
    private Matcher firstMatch(Pattern pattern) {
        for (String text : new String[] {amount, extra}) {
            if (text == null) continue;
            Matcher m = pattern.matcher(text);
            if (m.find()) return m;
        }
        return null;
    }

    /** 대표값. "최대 30%"처럼 정액이 아니면 null. */
    private Integer headlineAmount() {
        if (amount == null) return null;
        Matcher m = HEADLINE.matcher(amount);
        return m.find() ? digits(m.group(1)) : null;
    }

    private static Integer digits(String raw) {
        try {
            return Integer.valueOf(raw.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** {@code startsOn <= day <= endsOn}. 경계일 자신도 포함이다. */
    boolean activeOn(LocalDate day) {
        return !day.isBefore(startsOn) && !day.isAfter(endsOn);
    }
}
