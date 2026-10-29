package com.discounttracker.sharing;

import com.discounttracker.analytics.ClientFingerprint;
import com.discounttracker.analytics.EventRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/share-links")
public class ShareLinkController {
    private final ShareLinkStore store;
    private final ClientFingerprint fingerprint;
    private final EventRateLimiter limiter = new EventRateLimiter();
    public ShareLinkController(ShareLinkStore store, ClientFingerprint fingerprint) {
        this.store = store; this.fingerprint = fingerprint;
    }
    @PostMapping
    public ResponseEntity<?> create(@RequestBody(required = false) ShareLinkStore.Target target, HttpServletRequest request) throws IOException {
        if (target == null || !target.valid()) return ResponseEntity.badRequest().build();
        if (!limiter.tryConsume(fingerprint.hash(request), 4)) return ResponseEntity.status(429).build();
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("code", store.create(target)));
    }
    @GetMapping("/{code}")
    public ResponseEntity<?> find(@PathVariable String code) {
        if (!code.matches("[A-Za-z0-9_-]{16}")) return ResponseEntity.notFound().build();
        var target = store.find(code);
        return target == null ? ResponseEntity.notFound().build() : ResponseEntity.ok().header("Cache-Control", "no-store").body(target);
    }
}
