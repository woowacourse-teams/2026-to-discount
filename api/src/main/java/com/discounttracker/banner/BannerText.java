package com.discounttracker.banner;

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
 */
final class BannerText {

    private BannerText() {
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
