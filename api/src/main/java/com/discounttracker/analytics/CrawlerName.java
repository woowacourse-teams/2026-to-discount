package com.discounttracker.analytics;

import java.util.Locale;
import java.util.Map;

/**
 * User-Agent가 스스로 밝힌 크롤러 이름. 사람이면 {@code null}.
 *
 * <p><b>왜 UA 문자열을 안 남기고 이름만 남기는가.</b> UA 원문은 브라우저·OS·
 * 버전이 붙어 있어 사람을 좁히는 데 쓸 수 있다({@link VisitEvent} 주석이
 * "UA 문자열도 저장하지 않는다"고 못박은 이유다). 반면 {@code googlebot}은
 * 공개된 식별자라 그것만으로는 누구도 가리키지 않는다.
 *
 * <p><b>왜 수집 시점에 적어도 되는가.</b> 개발 트래픽을 {@code device}와
 * {@code viewport}로 <i>추론</i>했다가 안드로이드 폰 368명을 개발자로 잘못
 * 몰았던 적이 있다(그래서 그 판정은 집계로 옮겼다). 여기는 추론이 아니다 —
 * 요청이 스스로 "나는 Googlebot이다"라고 말한 것을 받아 적을 뿐이라
 * {@code referrer}나 {@code dev} 플래그와 같은 성격이다.
 *
 * <p>판정은 여전히 집계에서 한다. 원장에는 이름이 남고, 뺄지 말지는
 * {@code scripts/experiments.py}가 정한다.
 *
 * <p>UA는 누구나 사칭할 수 있다. 여기서 잡는 것은 "스스로 밝힌 봇"이지
 * "봇 전부"가 아니다 — 숨기는 봇은 못 잡는다.
 */
final class CrawlerName {

    /** 소문자 UA에 이 조각이 있으면 그 이름으로 적는다. 긴 것부터 본다. */
    private static final Map<String, String> KNOWN = Map.ofEntries(
            Map.entry("googlebot", "googlebot"),
            Map.entry("google-inspectiontool", "googlebot"),
            Map.entry("storebot-google", "googlebot"),
            Map.entry("bingbot", "bingbot"),
            Map.entry("yeti", "naver"),          // 네이버 검색로봇
            Map.entry("daum", "daum"),
            Map.entry("duckduckbot", "duckduckgo"),
            Map.entry("yandex", "yandex"),
            Map.entry("applebot", "applebot"),
            Map.entry("gptbot", "openai"),
            Map.entry("oai-searchbot", "openai"),
            Map.entry("chatgpt-user", "openai"),
            Map.entry("claudebot", "anthropic"),
            Map.entry("anthropic-ai", "anthropic"),
            Map.entry("perplexitybot", "perplexity"),
            Map.entry("ccbot", "commoncrawl"),
            Map.entry("ahrefsbot", "ahrefs"),
            Map.entry("semrushbot", "semrush"),
            Map.entry("facebookexternalhit", "facebook"),
            Map.entry("twitterbot", "twitter"),
            Map.entry("slackbot", "slack"),
            Map.entry("telegrambot", "telegram"),
            Map.entry("vercel", "vercel"));

    /** 위 목록에 없지만 스스로 봇이라 밝힌 경우. 이름은 뭉뚱그린다. */
    private static final String[] GENERIC = {"bot", "crawler", "spider", "crawling"};

    private CrawlerName() {
    }

    static String of(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return null;
        String ua = userAgent.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, String> e : KNOWN.entrySet()) {
            if (ua.contains(e.getKey())) return e.getValue();
        }
        for (String g : GENERIC) {
            if (ua.contains(g)) return "other";
        }
        return null;
    }
}
