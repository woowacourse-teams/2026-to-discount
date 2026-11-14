package com.discounttracker.analytics;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 키별 분당·하루 제한. 하루 제한이 없으면 {@code Integer.MAX_VALUE}. */
final class ReportRateLimiter {

    private final int perMinute;
    private final int perDay;
    // ponytail: 메모리 카운터, EventRateLimiter와 같은 한계(재시작 초기화, 인스턴스 한 대).
    private final Map<String, Deque<Instant>> recent = new ConcurrentHashMap<>();

    ReportRateLimiter(int perMinute, int perDay) {
        this.perMinute = perMinute;
        this.perDay = perDay;
    }

    synchronized boolean allow(String key, Instant now) {
        // 다 지우면 모든 사람의 제한이 풀린다. 하루 지난 기록만 걷는다.
        if (recent.size() > 10_000) {
            Instant cutoff = now.minus(Duration.ofDays(1));
            recent.values().forEach(q -> { while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) q.pollFirst(); });
            recent.values().removeIf(Deque::isEmpty);
        }
        Deque<Instant> times = recent.computeIfAbsent(key, k -> new ArrayDeque<>());
        while (!times.isEmpty() && times.peekFirst().isBefore(now.minus(Duration.ofDays(1)))) {
            times.pollFirst();
        }
        long lastMinute = times.stream().filter(t -> t.isAfter(now.minus(Duration.ofMinutes(1)))).count();
        if (times.size() >= perDay || lastMinute >= perMinute) return false;
        times.addLast(now);
        return true;
    }
}
