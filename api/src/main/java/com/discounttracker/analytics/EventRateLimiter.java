package com.discounttracker.analytics;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 이벤트 수집은 인증 없는 공개 엔드포인트라 그대로 두면 디스크를 채워 넣을 수
 * 있다. IP 해시별로 분당 허용량만 건다.
 *
 * <p>메모리 카운터라 서버를 재시작하면 초기화되고, 인스턴스가 여러 대면
 * 각자 센다. 지금은 인스턴스 한 대라 그걸로 충분하다.
 * ponytail: 분산 카운터는 인스턴스가 늘면 그때.
 */
@Component
public class EventRateLimiter {

    private static final int MAX_EVENTS_PER_WINDOW = 120;
    private static final Duration WINDOW = Duration.ofMinutes(1);
    /** 창이 지난 항목은 접근할 때 지우지만, 안 돌아오는 IP가 쌓이는 건 막아야 한다. */
    private static final int MAX_TRACKED = 10_000;

    private record Bucket(Instant windowStart, int count) {}

    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    /** 허용되면 true. 창을 넘긴 만큼은 거절한다. */
    public boolean tryConsume(String key, int events) {
        Instant now = Instant.now();
        if (buckets.size() > MAX_TRACKED) buckets.clear();

        Bucket updated = buckets.compute(key, (k, prev) -> {
            if (prev == null || Duration.between(prev.windowStart(), now).compareTo(WINDOW) > 0) {
                return new Bucket(now, events);
            }
            return new Bucket(prev.windowStart(), prev.count() + events);
        });
        return updated.count() <= MAX_EVENTS_PER_WINDOW;
    }
}
