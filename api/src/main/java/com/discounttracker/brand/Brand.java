package com.discounttracker.brand;

import java.util.Map;

/**
 * 브랜드 하나에 대해 우리가 아는 전부.
 *
 * <p>원장(export.json)에는 브랜드 이름만 찍힌다. 그 이름을 어떻게 묶고
 * (aliases), 무슨 분류이고(category), 어디로 보낼지(links)는 전부 사람이
 * 정하는 지식이라 {@code brands.yml}에 모아둔다.
 *
 * @param name     대표명. 화면·로고 파일명·API 응답이 모두 이 이름을 쓴다.
 * @param category 분류. 미분류면 null.
 * @param links    앱별 브랜드 쿠폰 바로가기. 플랫폼 키(ddangyo, baemin, ...) ->
 *                 링크. 앱마다 딥링크가 따로라 앱 하나당 링크 하나다. 모르는
 *                 앱은 그냥 안 들어 있다 — null이 아니라 빈 맵.
 */
public record Brand(String name, Category category, Map<String, String> links) {

    /** brands.yml에 항목이 없는 브랜드 — 원장에만 있고 우리가 아는 게 없는 경우. */
    static Brand unknown(String name) {
        return new Brand(name, null, Map.of());
    }
}
