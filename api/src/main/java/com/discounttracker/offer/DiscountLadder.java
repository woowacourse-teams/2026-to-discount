package com.discounttracker.offer;

import java.util.Comparator;
import java.util.List;

/**
 * 겹쳐 쓰는 쿠폰의 문턱별 누적 금액 — "얼마 이상 시키면 얼마 받는가"의 사다리.
 *
 * <p>요기요는 브랜드 하나에 쿠폰을 두 장 걸고 둘을 겹쳐 쓸 수 있다(굽네치킨
 * 실측 2026-07-31: 17,000원 이상 4,000원 고정 메뉴할인 + 25,000원 이상
 * 5%·상한 3,000원). 문턱을 낮은 순으로 훑으며 그 문턱에서 자격이 되는 구간을
 * 전부 더하면 사다리가 나온다.
 *
 * <pre>
 *   17,000원 이상 -> 4,000
 *   25,000원 이상 -> 4,000 + 1,250 = 5,250
 * </pre>
 *
 * <p>{@link #bestAmount()}가 카드에 뜨는 대표 금액이다. 쿠폰을 다 겹쳤을
 * 때 받는 금액이고, {@code qualifier: "최적"} 배지가 "조건을 다 맞췄을 때"
 * 임을 알린다.
 *
 * <p>처음에는 최저 문턱(보장 바닥값)을 대표로 썼다(ADR-019 원안). 그러면
 * 굽네치킨 카드가 4,000원으로 떠서 정률 쿠폰을 겹칠 수 있다는 사실 자체가
 * 화면에서 사라진다 — 겹침을 따로 모델링한 의미가 없어진다. 상세를 펼치면
 * 문턱별 사다리가 그대로 보이므로 4,000원만 받는 구간도 감춰지지 않는다.
 *
 * <p>각 구간의 {@link DiscountTier#amount()}는 이미 "그 문턱에서 실제 받는
 * 금액"이라 여기서 정률을 다시 계산하지 않는다.
 *
 * <p>tracker의 {@code export_data.ladder_best()}와 같은 값을 내야 한다.
 * 두 레이어가 다른 규칙을 쓰면 어느 쪽을 거치느냐로 화면 금액이 갈린다
 * (ADR-016). 양쪽 테스트가 굽네치킨의 5,250을 같은 숫자로 고정한다.
 */
public record DiscountLadder(List<Rung> rungs) {

    /** 사다리 한 칸 — {@code minOrder}원 이상 시키면 {@code amount}원. */
    public record Rung(int minOrder, int amount) {
    }

    /**
     * 구간 목록에서 사다리를 세운다. 만료·품절 구간은 부르는 쪽이 미리
     * 걸러서 넘긴다({@link OfferRecord#liveTiers}).
     */
    public static DiscountLadder of(List<DiscountTier> tiers) {
        List<Integer> thresholds = tiers.stream()
                .map(DiscountLadder::thresholdOf)
                .distinct()
                .sorted()
                .toList();

        List<Rung> rungs = thresholds.stream()
                .map(threshold -> new Rung(threshold, sumAt(tiers, threshold)))
                .sorted(Comparator.comparingInt(Rung::minOrder))
                .toList();

        return new DiscountLadder(rungs);
    }

    /** 가장 높은 칸의 금액. 구간이 없으면 {@code null}. */
    public Integer bestAmount() {
        return rungs.isEmpty() ? null : rungs.get(rungs.size() - 1).amount();
    }

    private static int thresholdOf(DiscountTier tier) {
        return tier.minOrder() == null ? 0 : tier.minOrder();
    }

    private static int sumAt(List<DiscountTier> tiers, int threshold) {
        return tiers.stream()
                .filter(t -> thresholdOf(t) <= threshold)
                .filter(t -> t.amount() != null)
                .mapToInt(DiscountTier::amount)
                .sum();
    }
}
