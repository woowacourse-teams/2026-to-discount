package com.discounttracker.web;

import com.discounttracker.push.PushProperties;
import com.discounttracker.push.PushEndpointPolicy;
import com.discounttracker.push.PushStateStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/push")
public class PushSubscriptionController {
    private final PushProperties properties;
    private final PushStateStore store;

    public PushSubscriptionController(PushProperties properties, PushStateStore store) {
        this.properties = properties;
        this.store = store;
    }

    @GetMapping("/public-key")
    public ResponseEntity<?> publicKey() {
        if (!properties.configured()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(Map.of("publicKey", properties.publicKey()));
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<?> subscribe(@RequestBody SubscriptionRequest request) {
        if (!properties.configured()) return ResponseEntity.status(503).body(Map.of("enabled", false));
        if (request == null || request.keys() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_subscription"));
        }
        if (!PushEndpointPolicy.isAllowed(request.endpoint())) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_subscription"));
        }
        try {
            var saved = store.upsert(request.endpoint(), request.keys().p256dh(), request.keys().auth(),
                    request.visitorId(), request.analyticsEnabled());
            return ResponseEntity.ok(Map.of("subscriptionId", saved.id()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_subscription"));
        }
    }

    @DeleteMapping("/subscriptions")
    public ResponseEntity<?> unsubscribe(@RequestBody UnsubscribeRequest request) {
        if (request == null || request.endpoint() == null || request.endpoint().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid_subscription"));
        }
        store.remove(request.endpoint());
        return ResponseEntity.noContent().build();
    }

    public record SubscriptionRequest(String endpoint, Keys keys, String visitorId,
                                      boolean analyticsEnabled) {}
    public record Keys(String p256dh, String auth) {}
    public record UnsubscribeRequest(String endpoint) {}
}
