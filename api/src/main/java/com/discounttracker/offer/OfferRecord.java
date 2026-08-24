package com.discounttracker.offer;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * 원장(export.json) 한 줄 그대로. 판독 파이프라인이 만든 값이라 여기서는
 * 해석하지 않고 받기만 한다.
 *
 * <p>{@code minOrderAmount}·{@code tiers}·{@code conditions}는 쿠폰 상세를
 * 열어야 보이는 값이라 지금 원장에선 대부분 비어 있다. 비어 있다는 사실도
 * 데이터다 — 화면에 "미확인"으로 그대로 드러낸다.
 */
public record OfferRecord(
        String platform,
        String brand,
        Integer amount,
        String qualifier,
        boolean needsReview,
        String offerType,
        String section,
        String rawText,
        String capturedAt,
        String screenshotPath,
        Integer minOrderAmount,
        // 이 레코드의 tiers를 택일로 볼지 누적으로 볼지. "cumulative"면
        // 쿠폰 여러 장을 겹쳐 쓴다는 뜻이라 대표값을 사다리에서 계산한다
        // (tracker ADR-019). null 허용이다 — tracker가 이 필드를 실어
        // 보내기 전의 export.json에는 키 자체가 없고, 없으면 지금까지의
        // 해석(택일)이다.
        String tierMode,
        List<DiscountTier> tiers,
        String conditions,
        String expiresAt,
        String badge,
        // 이 오퍼만 가리키는 곳. 원장(export.json)에는 없는 키다 — 배너에서
        // 세운 오퍼만 채운다. 브랜드 링크(brands.yml)를 대체하지 않는다.
        String link,
        // Boolean(nullable)이다 — primitive boolean이면 JSON에 "soldOut":null이
        // 들어올 때 MismatchedInputException으로 reload 전체가 깨진다(사람이
        // 직접 export.json을 편집하다 실측, 2026-08-04). null은 false로
        // 본다(Offer.from에서 정규화).
        Boolean soldOut
) {

    /**
     * 금액이 있고 재확인도 필요 없어야 확정이다.
     *
     * <p>{@code qualifier}("최대")는 보지 않는다 — 땡겨요처럼 배너 문구는
     * "최대"지만 실제로는 정가인 경우가 있어, 확정 여부와 문구는 별개다.
     */
    public OfferStatus status() {
        return amount != null && !needsReview ? OfferStatus.CONFIRMED : OfferStatus.HELD;
    }

    /** 쿠폰을 겹쳐 쓰는 오퍼인가. 모르면(null) 아니다 — 지금까지의 해석이 택일이다. */
    public boolean isCumulative() {
        return "cumulative".equals(tierMode);
    }

    /**
     * 오늘 실제로 받을 수 있는 구간 — 만료된 것과 품절된 것을 뺀 나머지.
     *
     * <p>{@link #liveTiers}는 만료만 본다. 상세 패널에는 품절 구간도
     * "품절"이라고 보여줘야 하기 때문이다. 반면 금액을 더할 때는 품절 구간을
     * 빼야 한다 — 못 받는 금액을 더하면 카드가 실제보다 큰 값을 말한다
     * (쿠팡이츠 메가MGC커피 실측: 20,000원 구간이 품절이라 대표값이 6,000원).
     */
    private List<DiscountTier> claimableTiers(LocalDate today) {
        return liveTiers(today).stream()
                .filter(t -> !Boolean.TRUE.equals(t.soldOut()))
                .toList();
    }

    /**
     * 오늘 이 오퍼에 남은 게 하나도 없는지. 그렇다면 화면에 내보내지 않는다.
     *
     * <p>구간이 있으면 구간이 판정 단위다 — 하나라도 살아 있으면 오퍼는
     * 살아 있다. 한 레코드에 걸린 쿠폰들이 같은 날 끝난다는 보장이 없어서다
     * ({@link DiscountTier#expiresAt()} 참고).
     *
     * <p>구간을 모르는 레코드(원장 138건 중 125건)는 레코드의 종료일로
     * 판정한다.
     *
     * @param today 판정 기준 날짜. 요청을 처리하는 시점의 한국 날짜다 —
     *              원장을 적재할 때 계산해 캐시에 굳히면 자정이 지나도
     *              만료가 반영되지 않는다.
     */
    public boolean isExpired(LocalDate today) {
        if (tiers == null || tiers.isEmpty()) {
            return isPast(expiresAt, today);
        }
        return liveTiers(today).isEmpty();
    }

    /**
     * 오늘 아직 받을 수 있는 구간만. 구간을 모르면 {@code null} 그대로 둔다 —
     * 비어 있다는 사실도 데이터다(ADR-003).
     *
     * <p>구간에 종료일이 없으면 레코드의 종료일을 따른다. 구간별 종료일은
     * "이 구간만 따로 끝날 때" 채우는 값이라, 비어 있다는 건 이 구간이
     * 쿠폰 전체와 같은 날 끝난다는 뜻이다.
     */
    public List<DiscountTier> liveTiers(LocalDate today) {
        if (tiers == null) {
            return null;
        }
        return tiers.stream()
                .filter(t -> !isPast(t.expiresAt() != null ? t.expiresAt() : expiresAt, today))
                .toList();
    }

    /**
     * 살아 있는 구간을 다 봐도 대표값에 못 미치면 그만큼 내린 금액.
     *
     * <p>남은 구간이 전부 대표값보다 작으면 그 대표값은 이제 아무도 받을 수
     * 없는 금액이다. 청년피자 땡겨요가 그렇다 — 청피데이 9,000원이 대표값인데
     * 그게 끝나면 남는 건 상시 5,000원뿐이다. 이때는 5,000원으로 내린다.
     *
     * <p><b>올리지는 않는다.</b> 원장의 대표값은 단순한 "가장 큰 구간"이 아니라
     * "일반 사용자가 실제로 받을 수 있는 최대"라서다. 품절 구간에서 안 뽑고
     * (쿠팡이츠 메가MGC커피: 20,000원 구간이 품절이라 대표값 6,000원),
     * 멤버십 전용 구간에서도 안 뽑는다(배민 도미노피자: 일반 4,000원 /
     * 멤버십 7,500원인데 대표값은 4,000원). 그 조건들은 구간에 실려 있지 않아
     * 여기서 다시 만들 수 없다 — 남은 구간 중 최대가 대표값보다 크더라도
     * 그건 일반 사용자가 못 받는 금액일 수 있으므로 손대지 않는다.
     *
     * <p><b>겹쳐 쓰는 오퍼는 다르다.</b> {@code tierMode}가 {@code "cumulative"}면
     * 대표값을 사다리에서 계산한다({@link DiscountLadder}). 겹친다는 사실이
     * 데이터에 실려 있어 계산에 필요한 정보가 전부 있으므로, 아래의 "올리지
     * 않는다"가 적용되지 않는다(ADR-010).
     */
    public Integer amountAsOf(LocalDate today) {
        if (isCumulative()) {
            if (tiers == null || tiers.isEmpty()) {
                return amount;
            }
            Integer best = DiscountLadder.of(claimableTiers(today)).bestAmount();
            return best != null ? best : amount;
        }
        if (tiers == null || tiers.isEmpty() || amount == null) {
            return amount;
        }
        Integer live = liveTiers(today).stream()
                .filter(t -> !Boolean.TRUE.equals(t.soldOut()) && t.amount() != null)
                .map(DiscountTier::amount)
                .max(Integer::compareTo)
                .orElse(null);
        return live != null && live < amount ? live : amount;
    }

    /**
     * 종료일 당일까지는 유효하다 — 앱에 "~2026.08.31 사용가능"으로 뜨는
     * 값이고, 그 날 자정까지 쓸 수 있다는 뜻이다. 다음 날부터 만료다.
     *
     * <p>종료일을 모르거나 날짜 형식이 깨졌으면 만료로 보지 않는다. 모른다는
     * 것과 끝났다는 것은 다르고, 판독이 잘못됐다고 해서 살아 있을지 모르는
     * 할인을 조용히 감추면 사용자는 그 브랜드에 할인이 없는 줄 안다
     * (ADR-003과 같은 이유).
     */
    private static boolean isPast(String date, LocalDate today) {
        if (date == null) {
            return false;
        }
        try {
            return LocalDate.parse(date).isBefore(today);
        } catch (DateTimeParseException e) {
            return false;
        }
    }
}
