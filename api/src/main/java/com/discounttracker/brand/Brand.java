package com.discounttracker.brand;

import java.util.List;
import java.util.Map;

/**
 * 브랜드 하나에 대해 우리가 아는 전부.
 *
 * <p>원장(export.json)에는 브랜드 이름만 찍힌다. 그 이름을 어떻게 묶고
 * (aliases), 무슨 분류이고(category), 어디로 보낼지(links)는 전부 사람이
 * 정하는 지식이라 {@code brands.yml}에 모아둔다.
 *
 * @param name     대표명. 화면·로고 파일명·API 응답이 모두 이 이름을 쓴다.
 * @param searchAliases 사용자가 검색할 때 쓰는 한국어·영문 별칭.
 * @param shortName 배너처럼 자리가 좁은 곳에 쓰는 짧은 이름("후라이드참잘하는집" -> "후참잘").
 *                  없으면 대표명을 그대로 쓴다. 로고 파일과 원장은 대표명을 쓴다 — 짧은
 *                  이름은 **보여 주는 자리에만** 쓴다(2026-09-22 사용자).
 * @param category 분류. 미분류면 null.
 * @param links    앱별 브랜드 쿠폰 바로가기. 플랫폼 키(ddangyo, baemin, ...) ->
 *                 링크. 앱마다 딥링크가 따로라 앱 하나당 링크 하나다. 모르는
 *                 앱은 그냥 안 들어 있다 — null이 아니라 빈 맵.
 */
public record Brand(String name, List<String> searchAliases, String shortName,
                    Category category, Map<String, String> links) {

    /** 좁은 자리에서 쓸 이름. 짧은 이름이 없으면 대표명. */
    public String display() {
        return shortName == null || shortName.isBlank() ? name : shortName;
    }

    /** brands.yml에 항목이 없는 브랜드 — 원장에만 있고 우리가 아는 게 없는 경우. */
    static Brand unknown(String name) {
        return new Brand(name, List.of(), null, null, Map.of());
    }
}
