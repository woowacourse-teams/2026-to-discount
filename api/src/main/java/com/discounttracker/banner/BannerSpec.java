package com.discounttracker.banner;

import java.util.List;

/**
 * 배너의 구조 필드(설계 25, 2026-09-18 결정). 자유 문장 {@code amount}, {@code period},
 * {@code extra} 대신 이 값들에서 문구를 만든다({@link BannerText}).
 *
 * <p>전부 선택이다. 문장 칸이 적혀 있으면 그 문장이 우선한다(이행 기간 규칙). 필드 이름은
 * 오퍼 구간(tier)과 같은 어휘를 쓴다.
 *
 * @param items       묶음 배너의 브랜드별 값. 브랜드마다 금액, 최소주문, 열림 시각이 다르다.
 *                    한 브랜드짜리도 원소 하나로 적을 수 있다.
 * @param amountRange 랜덤 쿠폰의 [최소, 최대]. 최소는 모를 때가 많아 null을 허용한다.
 * @param opensAt     매일 여는 시각 "HH:MM". 브랜드마다 다르면 items 쪽에 적는다.
 * @param limit       first_come, random, targeted, none
 * @param usage       use(사용 선착순), issue(발급 선착순). limit이 first_come일 때만 뜻이 있다.
 * @param channel     배달, 포장
 * @param membership  플랫폼 멤버십 키(예: coupangEats)
 * @param event       짧은 행사 제목(뚜쥬데이, 위클리 슈퍼딜)
 * @param note        위 칸에 안 담기는 나머지 한 줄
 */
public record BannerSpec(
        List<BannerItem> items,
        List<Integer> amountRange,
        String opensAt,
        String limit,
        String usage,
        String channel,
        String membership,
        String event,
        String note) {

    public record BannerItem(String brand, Integer amount, Integer minOrder, String opensAt) {
    }

    public BannerSpec {
        if (amountRange != null && (amountRange.size() != 2 || amountRange.get(1) == null)) {
            throw new IllegalArgumentException("amountRange는 [최소 또는 null, 최대] 두 칸이고 최대는 비울 수 없다");
        }
        if (items != null) {
            for (BannerItem it : items) {
                if (it == null || it.brand() == null || it.brand().isBlank()) {
                    throw new IllegalArgumentException("items의 원소마다 brand가 있어야 한다");
                }
            }
        }
    }

    public boolean isEmpty() {
        return (items == null || items.isEmpty()) && amountRange == null && opensAt == null
                && limit == null && usage == null && channel == null && membership == null
                && event == null && note == null;
    }
}
