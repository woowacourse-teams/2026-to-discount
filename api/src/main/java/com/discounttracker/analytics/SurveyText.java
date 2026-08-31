package com.discounttracker.analytics;

import java.util.regex.Pattern;

/**
 * 설문 직접 입력을 원장에 적기 전에 거른다.
 *
 * <p>이 서비스는 자유 입력 원문을 안 남겨 왔다 — 검색 계측이 {@code query}를
 * 버리고 {@code inputLength}·{@code resultCount}만 적는다. 이유는 자유
 * 텍스트라서가 아니라 전화번호·주소가 섞여 들어올 수 있어서였다.
 *
 * <p>설문은 우리가 무엇을 물을지 정하므로 특정성이 들어올 통로를 좁힐 수
 * 있다. 그래도 사용자는 실수한다. 마지막 겹이 여기다 — 사용자가 넣어도
 * 원장에 안 닿는다.
 */
final class SurveyText {

    /** 스펙이 정한 상한. 긴 사연이 들어올 자리를 주지 않는다. */
    static final int MAX = 200;

    // 주민번호를 전화번호보다 먼저 지운다. 순서를 바꾸면 앞 6자리가 전화번호
    // 꼴에 안 걸려 뒷자리만 지워지고 생년월일이 남는다.
    // 구분자를 선택으로 둔다. 필수로 두면 붙여 쓴 주민번호(9112253456789)가 통째로
    // 빠져나간다 — 전화번호가 우연히 걸러 주는 경우가 있지만 그 13자리에 0이 없으면
    // 아무것도 안 걸린다. 전화번호도 "하이픈 있든 없든" 둘 다 잡으므로 주민번호도
    // 그렇게 해야 한다.
    private static final Pattern RESIDENT = Pattern.compile("\\d{6}\\s*[-\\s]?\\s*\\d{7}");
    private static final Pattern EMAIL =
            Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");
    // 하이픈이 있든 없든, 국번이 3자리든 4자리든 잡는다.
    private static final Pattern PHONE =
            Pattern.compile("0\\d{1,2}\\s*[-.\\s]?\\s*\\d{3,4}\\s*[-.\\s]?\\s*\\d{4}");

    private static final String MASK = "[삭제]";

    private SurveyText() {
    }

    static String clean(String raw) {
        if (raw == null) return null;
        String out = raw.trim();
        out = RESIDENT.matcher(out).replaceAll(MASK);
        out = EMAIL.matcher(out).replaceAll(MASK);
        out = PHONE.matcher(out).replaceAll(MASK);
        return out.length() <= MAX ? out : out.substring(0, MAX);
    }
}
