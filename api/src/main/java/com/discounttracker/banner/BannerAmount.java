package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;
import com.discounttracker.offer.Certainty;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 배너가 주는 값. 모양이 하나다.
 *
 * <pre>
 * amount: {won: 8000}                        8,000원 할인
 * amount: {won: [null, 8000]}                최대 8,000원
 * amount: {won: [1000, 8000], random: true}  1,000~8,000원 랜덤
 * amount: {percent: 30}                      30% 할인
 * amount: {percent: 50, kind: cashback}      50% 캐시백
 * </pre>
 *
 * <p>{@code won}과 {@code percent}는 하나만 쓴다. 옛 모양의 문자열 {@code amount}와
 * {@code amountRange}를 이 한 칸이 대신한다.
 *
 * @param wonMin 정액의 하한. 범위이고 하한을 모르면 null
 * @param wonMax 정액의 상한. 정액 하나면 wonMin과 같다
 * @param percent 정률. won과 같이 못 쓴다
 * @param random 뽑기인가. 값이 사람마다 다르다
 * @param kind 무엇을 주는가
 */
public record BannerAmount(Integer wonMin, Integer wonMax, Integer percent,
                           boolean random, AmountKind kind) {

    public BannerAmount {
        if ((wonMin != null || wonMax != null) && percent != null) {
            throw new IllegalArgumentException("amount는 won과 percent 중 하나만 쓴다");
        }
        if (wonMin != null && wonMin < 0) {
            throw new IllegalArgumentException("amount.wonMin 값이 음수다: " + wonMin);
        }
        if (wonMax != null && wonMax < 0) {
            throw new IllegalArgumentException("amount.wonMax 값이 음수다: " + wonMax);
        }
        if (percent != null && percent < 0) {
            throw new IllegalArgumentException("amount.percent 값이 음수다: " + percent);
        }
    }

    /**
     * yml의 {@code amount:} 한 덩이에서. 덩이가 아니거나 금액이 없으면 null이다.
     *
     * @throws IllegalArgumentException won과 percent를 같이 적었거나, won/percent 중
     *         하나라도 음수일 때
     */
    @SuppressWarnings("unchecked")
    public static BannerAmount of(Object raw) {
        if (!(raw instanceof Map<?, ?> m)) return null;
        Map<String, Object> map = (Map<String, Object>) m;
        Integer percent = intOrNull(map.get("percent"));
        Integer lo = null;
        Integer hi = null;
        Object won = map.get("won");
        if (won instanceof List<?> pair && pair.size() == 2) {
            lo = intOrNull(pair.get(0));
            hi = intOrNull(pair.get(1));
        } else if (won != null) {
            lo = intOrNull(won);
            hi = lo;
        }
        if (hi == null && percent == null) return null;
        boolean random = Boolean.TRUE.equals(map.get("random"));
        AmountKind kind = AmountKind.from(map.get("kind") == null ? null : String.valueOf(map.get("kind")));
        return new BannerAmount(lo, hi, percent, random, kind);
    }

    /** 범위인가. 하한이 없거나 상한과 다르면 범위다. */
    public boolean isRange() {
        return percent == null && !Objects.equals(wonMin, wonMax);
    }

    /**
     * 오퍼로 세울 때 쓰는 대표 정액. 정률이면 null이다.
     *
     * <p>범위면 상한이다. 지금 "최대 8,000원" 배너가 8,000원으로 서고 표식이 그 값을
     * 액면대로 믿지 말라고 말한다.
     */
    public Integer headline() {
        return percent != null ? null : wonMax;
    }

    /** 이 금액을 액면대로 견줄 수 있나. 랜덤이 범위보다 먼저다. */
    public Certainty certainty() {
        if (percent != null) return Certainty.PERCENT;
        if (random) return Certainty.RANDOM;
        return isRange() ? Certainty.CAPPED : Certainty.EXACT;
    }

    private static Integer intOrNull(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v == null) return null;
        try {
            return Integer.valueOf(String.valueOf(v).replace(",", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
