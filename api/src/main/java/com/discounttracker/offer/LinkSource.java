package com.discounttracker.offer;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 오퍼 {@code link}가 어디서 왔나. {@code link}와 항상 짝이다({@code link == null}이면 {@link #NONE}).
 *
 * <p>수집 경로(직접 수집, 쿠폰함)와는 다른 축이다. 웹이 링크 주소를 비교하지 않고 구조로 가르려고 싣는다(#203).
 */
public enum LinkSource {

    /** 링크 없음. */
    NONE("none"),
    /** 수집된 링크. 원장 레코드가 자기 링크를 들고 온 경우. */
    RECORD("record"),
    /** 배너에서 받아온 링크. 배너 오퍼의 행사 링크. */
    BANNER("banner"),
    /** 응답에서 추가된 링크. API가 응답을 만들 때 단 링크(오픈 전 배민 선착순 허브, 소진 허브). */
    ADDED("added");

    private final String key;

    LinkSource(String key) {
        this.key = key;
    }

    @JsonValue
    public String key() {
        return key;
    }
}
