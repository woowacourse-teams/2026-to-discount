package com.discounttracker.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/** outbox의 due 이벤트를 단일 스레드에서 PostHog로 전달한다. */
@Component
public class PostHogForwardingWorker {

    static final int BATCH_SIZE = 20;

    private static final Logger log = LoggerFactory.getLogger(PostHogForwardingWorker.class);

    private final PostHogProperties properties;
    private final PostHogOutbox outbox;
    private final PostHogClient client;
    private final Executor executor;

    public PostHogForwardingWorker(PostHogProperties properties, PostHogOutbox outbox,
                                   PostHogClient client,
                                   @Qualifier("postHogExecutor") Executor executor) {
        this.properties = properties;
        this.outbox = outbox;
        this.client = client;
        this.executor = executor;
    }

    /** 신규 이벤트가 pending에 들어오면 주기 scan을 기다리지 않고 호출한다. */
    public void trigger() {
        if (!properties.enabled()) return;
        try {
            executor.execute(this::processDueSafely);
        } catch (RejectedExecutionException ex) {
            // 종료 중이면 pending은 디스크에 남고 다음 시작의 scan이 회수한다.
            log.warn("종료 중이라 PostHog 즉시 전달을 시작하지 못했다");
        }
    }

    @Scheduled(fixedDelayString = "${discount.posthog.scan-interval-ms:60000}")
    public void scheduledScan() {
        trigger();
    }

    void processDue() {
        while (true) {
            List<PostHogDelivery> deliveries = outbox.claimDue(BATCH_SIZE);
            if (deliveries.isEmpty()) return;

            PostHogClient.Result result = client.sendBatch(
                    deliveries.stream().map(PostHogDelivery::payload).toList());
            if (result.success()) {
                outbox.markSucceeded(deliveries);
            } else {
                outbox.markFailed(deliveries, result.error());
                log.warn("PostHog 이벤트 {}건 전달 실패: {}",
                        deliveries.size(), result.error());
            }
        }
    }

    private void processDueSafely() {
        try {
            processDue();
        } catch (RuntimeException ex) {
            // 처리 실패가 다음 scheduled scan까지 막지 않게 한다.
            log.error("PostHog outbox 처리 실패", ex);
        }
    }
}
