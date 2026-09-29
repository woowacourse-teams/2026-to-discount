package com.discounttracker.banner;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * 배너의 구조 필드(설계 25, 2026-09-18 결정). 자유 문장 {@code period}, {@code extra} 대신
 * 이 값들과 {@link Banner}의 칸에서 문구를 만든다({@link BannerText}).
 *
 * <p>전부 선택이다. 필드 이름은 오퍼 구간(tier)과 같은 어휘를 쓴다.
 *
 * <p>2026-09-29: 옛 칸 {@code items}, {@code amountRange}, {@code limit}, {@code usage}를 지웠다.
 * 2026-09-22부터 {@link BannerCatalog}가 이 record를 다섯 칸으로만 만들어서 네 칸은 파일에
 * 적혀 있어도 읽히지 않았고, 응답에는 늘 null로 실렸다(감사 2026-09-29 #5, #7). 확정 규칙은
 * {@code items[]}를 없앤다고 정했고(설계 "없어지는 칸"), 옛 {@code limit}/{@code usage}는
 * 파일을 읽을 때 {@code firstCome}/{@code targeted}/{@code amountSpec}으로 옮긴다.
 *
 * @param opensAt    매일 여는 시각 "HH:MM"
 * @param channel    배달, 포장
 * @param membership 플랫폼 멤버십 키(예: coupangEats)
 * @param event      짧은 행사 제목(뚜쥬데이, 위클리 슈퍼딜)
 * @param note       위 칸에 안 담기는 나머지 한 줄
 */
public record BannerSpec(
        String opensAt,
        String channel,
        String membership,
        String event,
        String note) {

    /** 응답 계약에 없는 칸이다. getter 이름 때문에 JSON에 {@code empty}로 새어 나갔다. */
    @JsonIgnore
    public boolean isEmpty() {
        return opensAt == null && channel == null && membership == null && event == null && note == null;
    }
}
