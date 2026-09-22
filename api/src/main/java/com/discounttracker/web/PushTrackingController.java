package com.discounttracker.web;

import com.discounttracker.analytics.AnalyticsEventService;
import com.discounttracker.analytics.VisitEvent;
import com.discounttracker.push.PushProperties;
import com.discounttracker.push.PushStateStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/push")
public class PushTrackingController {
    private final PushStateStore store;
    private final AnalyticsEventService analytics;
    private final PushProperties properties;
    private final Clock clock;

    public PushTrackingController(PushStateStore store, AnalyticsEventService analytics,
                                  PushProperties properties, Clock clock) {
        this.store = store;
        this.analytics = analytics;
        this.properties = properties;
        this.clock = clock;
    }

    @PostMapping("/displayed/{token}")
    public ResponseEntity<Void> displayed(@PathVariable String token) {
        track(token, "push_notification_displayed");
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/click/{token}")
    public ResponseEntity<Void> clicked(@PathVariable String token) {
        track(token, "push_notification_clicked");
        return ResponseEntity.status(302).location(URI.create(properties.frontendRoot())).build();
    }

    private void track(String token, String eventName) {
        store.track(token, eventName).ifPresent(context -> {
            var tracked = context.token();
            String seed = tracked.notificationId() + ":" + tracked.subscriptionId() + ":" + eventName;
            String eventId = UUID.nameUUIDFromBytes(seed.getBytes(StandardCharsets.UTF_8)).toString();
            analytics.append(List.of(new VisitEvent(
                    OffsetDateTime.now(clock).toString(), eventName, context.visitorId(), null,
                    null, "/", "internal", null, null, null,
                    Map.of("notificationId", tracked.notificationId(),
                            "deliveryType", tracked.deliveryType(),
                            "bannerCount", String.valueOf(tracked.bannerIds().size()),
                            "bannerIds", String.join(",", tracked.bannerIds())),
                    OffsetDateTime.now(clock).toString(), null, false, null, eventId, null)));
        });
    }
}
