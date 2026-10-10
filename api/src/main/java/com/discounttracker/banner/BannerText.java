package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;

import java.util.ArrayList;
import java.util.List;

/**
 * 구조 필드({@link BannerSpec})에서 화면 문구를 만든다(설계 25).
 *
 * <p>규칙은 지금 사람이 손으로 적던 문구와 글자까지 맞춘다. 문구를 여기서 만드는 이유는
 * 하나다: 파싱을 없앤다. 수집기와 웹이 {@code extra}를 읽어 브랜드와 금액을 되짚던 자리가
 * 2026-09-18 하루에 세 번 틀렸다.
 *
 * <p>2026-09-22 Task 5로 {@link BannerAmount}와 {@link Banner}에서 바로 만드는
 * {@link #amount(BannerAmount)}, {@link #period(Banner)}, {@link #extra(Banner)},
 * {@link #conditions(Banner)}가 들어왔다.
 *
 * <p>2026-09-29: {@link BannerSpec}의 옛 칸({@code items}, {@code amountRange}, {@code limit},
 * {@code usage})에서 문구를 만들던 메서드를 지웠다. 파일을 읽는 길이 그 칸을 싣지 않아 어디서도
 * 닿지 않는 코드였다(감사 2026-09-29 #5).
 */
public final class BannerText {

    private BannerText() {
    }

    /** 금액 문구. "7,000원", "최대 8,000원", "1,000~8,000원", "30% 할인", "50% 적립". */
    static String amount(BannerAmount a) {
        if (a == null) return null;
        if (a.isBundle()) return a.bundleText();
        if (a.percent() != null) {
            return a.percent() + "% " + (a.kind() == AmountKind.DISCOUNT ? "할인" : "적립");
        }
        if (a.wonMax() == null) return null;
        if (!a.isRange()) return won(a.wonMax()) + "원";
        return a.wonMin() == null ? "최대 " + won(a.wonMax()) + "원"
                : won(a.wonMin()) + "~" + won(a.wonMax()) + "원";
    }

    /**
     * 기간 문구.
     *
     * <p>순서가 있다. 매일 반복하는 오픈 시각이 있으면 그것이 먼저고, 없으면 시작 시각이
     * 자정이 아닐 때 그 시각을 말하고, 하루짜리면 날짜를, 아니면 종료일을 말한다.
     */
    static String period(Banner b) {
        java.time.LocalDateTime from = b.startsAt();
        java.time.LocalDateTime to = b.endsAt();
        boolean oneDay = from.toLocalDate().equals(to.toLocalDate());
        String opensAt = b.spec() == null ? null : b.spec().opensAt();
        if (opensAt != null) {
            String at = clock(opensAt) + " 오픈";
            return oneDay ? at : "매일 " + at;
        }
        if (from.getHour() != 0 || from.getMinute() != 0) {
            return clock(String.format("%02d:%02d", from.getHour(), from.getMinute())) + " 오픈";
        }
        if (oneDay) return from.getMonthValue() + "월 " + from.getDayOfMonth() + "일 하루";
        return "~" + to.getMonthValue() + "/" + to.getDayOfMonth();
    }

    /** 부가 문구. "[행사] / [최소주문↑], [한정들], [채널], [비고]". */
    static String extra(Banner b) {
        return join(b, true);
    }

    /**
     * 오퍼 상세의 조건 줄. {@link #extra(Banner)}에서 최소주문금액만 뺀다.
     *
     * <p>그 숫자는 이미 구간의 minOrder로 따로 뜬다. 둘 다 적으면 같은 문턱이 두 번
     * 보인다(2026-09-03 네네치킨 요기요 실측).
     */
    public static String conditions(Banner b) {
        return join(b, false);
    }

    private static String join(Banner b, boolean withMinOrder) {
        BannerSpec s = b.spec();
        List<String> tail = new ArrayList<>();
        if (withMinOrder && b.minOrder() != null) tail.add(won(b.minOrder()) + "원↑");
        if (b.isTargeted()) tail.add("타겟딜");
        if ("issue".equals(b.firstCome())) tail.add("발급 선착순");
        if ("use".equals(b.firstCome())) tail.add("사용(발급X) 선착순");
        if (b.amountSpec() != null && b.amountSpec().certainty() == com.discounttracker.offer.Certainty.RANDOM) {
            tail.add("랜덤쿠폰");
        }
        if (b.untilSoldOutFlag()) tail.add("소진 시 종료");
        if (s != null && s.channel() != null) tail.add(s.channel() + " 한정");
        if (s != null && s.note() != null) tail.add(s.note());
        // 타겟딜은 아무나 받는 것이 아니다. 그 사실이 조건 줄에 남아야 한다.
        if (!withMinOrder && b.isTargeted()) tail.add("한정");
        String body = String.join(", ", tail);
        String head = s == null ? null : s.event();
        if (head != null && !body.isEmpty()) return head + " / " + body;
        if (head != null) return head;
        return body.isEmpty() ? null : body;
    }

    /**
     * 금액 여럿을 한 줄로. {@code [7000, 6000, 6000, 5000]} -> {@code "7/6/6/5천원"}.
     *
     * <p>천 단위로 안 떨어지는 값이 하나라도 섞이면 전부 원래 표기로 둔다.
     * {@code "1.9/5천원"} 같은 표기는 읽는 사람이 한 번 더 생각해야 한다.
     */
    static String joinAmounts(List<Integer> amounts) {
        if (amounts.isEmpty()) return null;
        if (amounts.size() == 1) return won(amounts.get(0)) + "원";
        boolean thousands = amounts.stream().allMatch(a -> a % 1000 == 0);
        if (thousands) {
            return String.join("/", amounts.stream().map(a -> String.valueOf(a / 1000)).toList()) + "천원";
        }
        return String.join("/", amounts.stream().map(BannerText::won).toList()) + "원";
    }

    /** "11:00" → "오전 11시", "17:00" → "오후 5시", "17:30" → "오후 5시 30분". */
    static String clock(String hhmm) {
        int[] t = parse(hhmm);
        if (t == null) return hhmm;
        String ampm = t[0] < 12 ? "오전" : "오후";
        int h = t[0] == 0 ? 12 : t[0] > 12 ? t[0] - 12 : t[0];
        return ampm + " " + h + "시" + (t[1] != 0 ? " " + t[1] + "분" : "");
    }

    private static int[] parse(String hhmm) {
        if (hhmm == null || !hhmm.matches("\\d{1,2}:\\d{2}")) return null;
        String[] p = hhmm.split(":");
        return new int[]{Integer.parseInt(p[0]), Integer.parseInt(p[1])};
    }

    private static String won(int n) {
        return String.format("%,d", n);
    }
}
