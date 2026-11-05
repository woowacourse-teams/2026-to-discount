package com.discounttracker.analytics;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 로컬 전용. 개발 이벤트로 기록해 운영 집계와 외부 분석에 섞지 않는다. */
@Profile("local")
@RestController
@RequestMapping("/api/survey/demo")
public class PmfSurveyDemoController {
    private final EventLog events;
    private final Clock clock;
    public PmfSurveyDemoController(EventLog events, Clock clock) { this.events = events; this.clock = clock; }
    @PostMapping
    public Map<String, String> seed() {
        String id = "pmf_demo_" + UUID.randomUUID();
        String session = "s_" + UUID.randomUUID();
        events.append(List.of(event(id, "previous", "offer_link_click", clock.instant().minus(Duration.ofDays(1)).toString()),
                event(id, session, "page_view", clock.instant().toString())));
        return Map.of("visitorId", id, "sessionId", session);
    }
    private VisitEvent event(String visitor, String session, String event, String ts) {
        return new VisitEvent(ts, event, visitor, session, null, null, null, null, null, null,
                Map.of(), null, null, true, null, UUID.randomUUID().toString(), null);
    }
}
