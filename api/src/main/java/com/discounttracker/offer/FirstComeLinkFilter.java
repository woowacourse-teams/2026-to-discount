package com.discounttracker.offer;

import java.time.LocalTime;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 오픈 전 배민 선착순의 링크를 배짱할인 허브로 돌린다(2026-10-24 사용자).
 *
 * <p>선착순 쿠폰은 열리기 전에는 브랜드 쿠폰 페이지에 뜨지 않아, 브랜드 링크로 보내면 쿠폰이 없다. 오픈 시각 전까지는
 * 쿠폰이 미리 보이는 배짱할인 허브로 보내고, 오픈 시각 이후에는 링크를 건드리지 않아 원래 사다리
 * (브랜드 링크 → 검색 → 앱)로 돌아간다. 오퍼 자신의 링크(배너 유래)가 있으면 그것이 먼저라 건드리지 않는다.
 *
 * <p>오픈 시각은 원장 조건 글자("오전 10시 오픈 선착순")에서 읽는다. 못 읽으면 건드리지 않는다.
 */
public final class FirstComeLinkFilter {

    /** 수집기 capture/baemin_baejjang.py BAEJJANG_DEEPLINK와 같은 주소. */
    public static final String BAEMIN_BAEJJANG_HUB_LINK = "https://baemin.go.link/5H0ry";

    private static final Pattern OPENS = Pattern.compile("(오전|오후)\\s*(\\d{1,2})시(?:\\s*(\\d{1,2})분)?\\s*오픈");

    private FirstComeLinkFilter() {
    }

    /** now는 한국 시각. 오픈 전인 배민 선착순이면 링크를 허브로 바꾼 오퍼를, 아니면 받은 오퍼를 그대로 돌려준다. */
    public static Offer apply(Offer offer, LocalTime now) {
        if (!"baemin".equals(offer.platform()) || !offer.firstCome() || offer.link() != null) {
            return offer;
        }
        LocalTime opens = opensAt(offer.conditions());
        if (opens == null || !now.isBefore(opens)) {
            return offer;
        }
        return offer.withLink(BAEMIN_BAEJJANG_HUB_LINK);
    }

    static LocalTime opensAt(String conditions) {
        if (conditions == null) {
            return null;
        }
        Matcher m = OPENS.matcher(conditions);
        if (!m.find()) {
            return null;
        }
        int hour12 = Integer.parseInt(m.group(2));
        int minute = m.group(3) == null ? 0 : Integer.parseInt(m.group(3));
        if (hour12 < 1 || hour12 > 12 || minute > 59) {
            return null;
        }
        return LocalTime.of(hour12 % 12 + ("오후".equals(m.group(1)) ? 12 : 0), minute);
    }
}
