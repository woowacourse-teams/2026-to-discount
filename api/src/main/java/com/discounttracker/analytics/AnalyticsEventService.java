package com.discounttracker.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/** 원본 JSONL 기록과 외부 분석 전달의 경계를 조정한다. */
@Service
public class AnalyticsEventService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsEventService.class);

    private final EventLog eventLog;
    private final PostHogProperties properties;
    private final PostHogEventMapper mapper;
    private final PostHogOutbox outbox;
    private final PostHogForwardingWorker worker;

    public AnalyticsEventService(EventLog eventLog, PostHogProperties properties,
                                 PostHogEventMapper mapper, PostHogOutbox outbox,
                                 PostHogForwardingWorker worker) {
        this.eventLog = eventLog;
        this.properties = properties;
        this.mapper = mapper;
        this.outbox = outbox;
        this.worker = worker;
    }

    public void append(List<VisitEvent> events) {
        eventLog.append(events);
        if (!properties.enabled()) return;

        int enqueued = 0;
        for (VisitEvent event : events) {
            var mapped = mapper.map(event);
            if (mapped.isEmpty()) continue;
            try {
                outbox.enqueue(event.eventId(), mapped.get());
                enqueued++;
            } catch (RuntimeException ex) {
                // events.jsonl 기록은 이미 끝났다. 공개 수집 API의 성공 계약은 유지한다.
                log.error("원본에는 기록했지만 PostHog outbox 등록에 실패했다: eventId={}",
                        event.eventId(), ex);
            }
        }
        if (enqueued > 0) worker.trigger();
    }
}
