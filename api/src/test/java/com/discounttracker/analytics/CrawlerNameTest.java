package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class CrawlerNameTest {

    @Test
    void namesKnownCrawlers() {
        // 실제로 우리 페이지를 훑고 간 UA 모양으로 적는다.
        assertEquals("googlebot", CrawlerName.of(
                "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) "
                        + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 "
                        + "Mobile Safari/537.36 (compatible; Googlebot/2.1; "
                        + "+http://www.google.com/bot.html)"));
        assertEquals("bingbot", CrawlerName.of(
                "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"));
        // 네이버 검색로봇은 이름이 Yeti다 — naver가 안 들어간다.
        assertEquals("naver", CrawlerName.of(
                "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"));
        assertEquals("openai", CrawlerName.of("Mozilla/5.0 (compatible; GPTBot/1.2)"));
        assertEquals("anthropic", CrawlerName.of("Mozilla/5.0 (compatible; ClaudeBot/1.0)"));
    }

    @Test
    void fallsBackToOtherWhenItCallsItselfABot() {
        // 목록에 없어도 스스로 봇이라 밝혔으면 사람으로 세지 않는다.
        assertEquals("other", CrawlerName.of("SomeNewCrawler/1.0 (+http://example.test)"));
        assertEquals("other", CrawlerName.of("py-spider/2"));
    }

    @Test
    void leavesRealBrowsersAlone() {
        // 사람이 봇으로 잡히면 지표에서 통째로 사라진다. 개발 트래픽 규칙이
        // 안드로이드 폰 368명을 잘못 몰았던 것과 같은 종류의 사고다.
        assertNull(CrawlerName.of(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                        + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 "
                        + "Mobile/15E148 Safari/604.1"));
        assertNull(CrawlerName.of(
                "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"));
        assertNull(CrawlerName.of(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"));
        assertNull(CrawlerName.of(null));
        assertNull(CrawlerName.of("  "));
    }
}
