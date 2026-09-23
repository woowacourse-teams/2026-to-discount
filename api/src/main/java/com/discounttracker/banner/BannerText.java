package com.discounttracker.banner;

import com.discounttracker.offer.AmountKind;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

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
 * <p><b>{@link BannerSpec} 판 메서드는 옛 모양 전용이다(RULES 11, Task 19).</b>
 * {@code amount(BannerSpec)}, {@code period(BannerSpec, ...)}, {@code extra(BannerSpec, Integer)},
 * {@code minOrder(BannerSpec)}, {@code brands(BannerSpec)}가 그것이다. Task 19에서 실제
 * 호출부를 찾아봤는데 {@code main} 어디서도 이 다섯을 부르지 않았다 - {@code BannerCatalog}는
 * {@link #amount(BannerAmount)}/{@link #period(Banner)}/{@link #extra(Banner)}만 쓴다.
 * 지금은 {@code BannerTextTest}에서만 닿는 죽은 코드로 보이지만, RULES 1이 "손대면 안
 * 된다"고 못 박은 것과 같은 계열(BannerSpec 기반)이라 지우지 않고 그대로 둔다 - 실제로
 * 안 쓰이는지는 이 파일만 봐서 확신할 수 없고(리플렉션·향후 호출부 가능성), 지우는 결정은
 * 이 재설계의 범위 밖이다.
 */
public final class BannerText {

    private BannerText() {
    }

    /** 금액 문구. "7,000원", "최대 8,000원", "1,000~8,000원", "30% 할인", "50% 적립". */
    static String amount(BannerAmount a) {
        if (a == null) return null;
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

    /** 금액 문구. 6,000/5,000/8,000 → "6/5/8천원", 하나면 "8,000원", 범위는 "최대 8,000원". */
    static String amount(BannerSpec s) {
        if (s.amountRange() != null) {
            Integer lo = s.amountRange().get(0), hi = s.amountRange().get(1);
            return lo == null ? "최대 " + won(hi) + "원" : won(lo) + "~" + won(hi) + "원";
        }
        List<Integer> amounts = new ArrayList<>();
        if (s.items() != null) {
            for (BannerSpec.BannerItem it : s.items()) {
                if (it.amount() != null) amounts.add(it.amount());
            }
        }
        if (amounts.isEmpty()) return null;
        if (amounts.size() == 1) return won(amounts.get(0)) + "원";
        boolean thousands = amounts.stream().allMatch(a -> a % 1000 == 0);
        if (thousands) {
            return String.join("/", amounts.stream().map(a -> String.valueOf(a / 1000)).toList()) + "천원";
        }
        return String.join("/", amounts.stream().map(BannerText::won).toList()) + "원";
    }

    /** 기간 문구. 하루면 "9월 18일 하루", 매일 여는 시각이 있으면 "매일 오전 11시 오픈", 아니면 "~9/30". */
    static String period(BannerSpec s, LocalDate startsOn, LocalDate endsOn) {
        boolean oneDay = startsOn != null && startsOn.equals(endsOn);
        if (s.opensAt() != null) {
            String at = clock(s.opensAt()) + " 오픈";
            return oneDay ? at : "매일 " + at;
        }
        if (oneDay) return startsOn.getMonthValue() + "월 " + startsOn.getDayOfMonth() + "일 하루";
        if (endsOn != null) return "~" + endsOn.getMonthValue() + "/" + endsOn.getDayOfMonth();
        return null;
    }

    /** 부가 문구. "[행사] / [최소주문↑], [한정], [채널], [비고]". 브랜드별 시각이 있으면 "10시~ 버거킹 · 11시~ 본도시락". */
    static String extra(BannerSpec s, Integer minOrder) {
        List<String> parts = new ArrayList<>();
        if (s.items() != null && s.items().stream().anyMatch(it -> it.opensAt() != null)) {
            parts.add(openBrands(s.items()));
        }
        List<String> tail = new ArrayList<>();
        if (minOrder != null) tail.add(won(minOrder) + "원↑");
        String limit = limitText(s.limit(), s.usage());
        if (limit != null) tail.add(limit);
        if (s.channel() != null) tail.add(s.channel() + " 한정");
        if (s.note() != null) tail.add(s.note());
        String rest = String.join(", ", tail);
        String head = s.event();
        String body = parts.isEmpty() ? rest : (rest.isEmpty() ? parts.get(0) : parts.get(0) + " / " + rest);
        if (head != null && !body.isEmpty()) return head + " / " + body;
        if (head != null) return head;
        return body.isEmpty() ? null : body;
    }

    /** 배너 하나의 최소주문. items가 하나거나 전부 같으면 그 값, 아니면 null. */
    static Integer minOrder(BannerSpec s) {
        if (s.items() == null || s.items().isEmpty()) return null;
        Integer first = s.items().get(0).minOrder();
        for (BannerSpec.BannerItem it : s.items()) {
            if (!Objects.equals(it.minOrder(), first)) return null;
        }
        return first;
    }

    static List<String> brands(BannerSpec s) {
        if (s.items() == null || s.items().isEmpty()) return null;
        return s.items().stream().map(BannerSpec.BannerItem::brand).toList();
    }

    private static String limitText(String limit, String usage) {
        if (limit == null) return null;
        return switch (limit) {
            case "first_come" -> "issue".equals(usage) ? "발급 선착순" : "use".equals(usage) ? "사용(발급X) 선착순" : "선착순";
            case "random" -> "랜덤쿠폰";
            case "targeted" -> "타겟딜";
            // 적립은 지금 깎는 것이 아니라 나중에 포인트로 돌아온다(2026-09-22 백억커피).
            case "cashback" -> "적립";
            default -> null;
        };
    }

    private static String openBrands(List<BannerSpec.BannerItem> items) {
        StringBuilder out = new StringBuilder();
        String last = null;
        for (BannerSpec.BannerItem it : items) {
            if (out.length() > 0) out.append(" · ");
            String at = it.opensAt() == null ? null : shortClock(it.opensAt());
            if (at != null && !at.equals(last)) {
                out.append(at).append("~ ");
                last = at;
            }
            out.append(it.brand());
        }
        return out.toString();
    }

    /** "11:00" → "오전 11시", "17:00" → "오후 5시", "17:30" → "오후 5시 30분". */
    static String clock(String hhmm) {
        int[] t = parse(hhmm);
        if (t == null) return hhmm;
        String ampm = t[0] < 12 ? "오전" : "오후";
        int h = t[0] == 0 ? 12 : t[0] > 12 ? t[0] - 12 : t[0];
        return ampm + " " + h + "시" + (t[1] != 0 ? " " + t[1] + "분" : "");
    }

    /** "11:00" → "11시", "17:00" → "17시". 브랜드 나열에서 짧게 쓴다. */
    static String shortClock(String hhmm) {
        int[] t = parse(hhmm);
        if (t == null) return hhmm;
        return t[0] + "시" + (t[1] != 0 ? " " + t[1] + "분" : "");
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
