package com.discounttracker.analytics;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** 리팩토링 전 특성 테스트와 점검(2026-11-26 api-a) 재현 테스트. @Disabled는 고칠 때 켠다. */
class AuditAnalyticsTest {

    private final ClientFingerprint fp = new ClientFingerprint();

    private static MockHttpServletRequest req(String remote, String realIp, String xff) {
        var r = new MockHttpServletRequest();
        r.setRemoteAddr(remote);
        if (realIp != null) r.addHeader("X-Real-IP", realIp);
        if (xff != null) r.addHeader("X-Forwarded-For", xff);
        return r;
    }

    @Test
    void hashForLimitPrefersRealIpThenLastForwardedThenRemote() {
        assertEquals(fp.hashForLimit(req("9.9.9.9", "1.1.1.1", "6.6.6.6, 2.2.2.2")),
                fp.hashForLimit(req("8.8.8.8", "1.1.1.1", null)));
        assertEquals(fp.hashForLimit(req("9.9.9.9", null, "6.6.6.6, 2.2.2.2")),
                fp.hashForLimit(req("8.8.8.8", " ", "7.7.7.7,2.2.2.2")));
        assertEquals(fp.hashForLimit(req("3.3.3.3", null, null)),
                fp.hashForLimit(req("3.3.3.3", "", " ")));
        assertNotEquals(fp.hashForLimit(req("3.3.3.3", null, null)),
                fp.hashForLimit(req("4.4.4.4", null, null)));
    }

    @Test
    void hashFallsBackToRemoteAddrWithoutForwardedHeader() {
        assertEquals(fp.hash(req("3.3.3.3", null, null)), fp.hash(req("3.3.3.3", "1.1.1.1", "")));
        assertNotEquals(fp.hash(req("3.3.3.3", null, null)), fp.hash(req("4.4.4.4", null, null)));
    }

    @Disabled("audit: 01-api-a.md ClientFingerprint.hash가 위조 가능한 XFF 첫 값을 IP로 쓴다")
    @Test
    void hashIgnoresClientWrittenFirstForwardedValue() {
        assertEquals(fp.hash(req("10.0.0.1", "1.1.1.1", "6.6.6.6, 1.1.1.1")),
                fp.hash(req("10.0.0.1", "1.1.1.1", "7.7.7.7, 1.1.1.1")));
    }

    @Test
    void rateLimiterAllows120PerMinutePerKey() {
        var limiter = new EventRateLimiter();
        assertTrue(limiter.tryConsume("a", 100));
        assertTrue(limiter.tryConsume("a", 20));
        assertFalse(limiter.tryConsume("a", 1));
        assertTrue(limiter.tryConsume("b", 120));
        assertFalse(limiter.tryConsume("c", 121));
    }

    @Disabled("audit: 01-api-a.md EventRateLimiter 키 1만 개 초과 시 clear()로 모든 제한이 풀린다")
    @Test
    void floodingKeysDoesNotResetOthersLimit() {
        var limiter = new EventRateLimiter();
        assertTrue(limiter.tryConsume("victim", 120));
        for (int i = 0; i <= 10_001; i++) limiter.tryConsume("k" + i, 1);
        assertFalse(limiter.tryConsume("victim", 1));
    }

    @Disabled("audit: 01-api-a.md PopularityIndex 한 ipHash가 visitorId만 바꿔 HOT 순위를 부풀린다")
    @Test
    void oneIpHashCannotInflatePopularity(@TempDir Path dir) throws Exception {
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            lines.add("{\"ts\":\"2026-10-14T12:00:00+09:00\",\"event\":\"offer_link_click\",\"visitorId\":\"v" + i
                    + "\",\"ipHash\":\"same\",\"props\":{\"brand\":\"bhc\"}}");
        }
        Path log = dir.resolve("events.jsonl");
        Files.write(log, lines, StandardCharsets.UTF_8);
        Clock clock = Clock.fixed(Instant.parse("2026-10-14T06:00:00Z"), ZoneId.of("Asia/Seoul"));
        var idx = new PopularityIndex(new EventLog(log.toString(), new ObjectMapper()), new ObjectMapper(), clock);
        assertTrue(idx.todayOf("bhc") <= 1);
    }
}
