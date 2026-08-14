package com.discounttracker.analytics;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.nio.file.Path;

/** PostHog 전달 설정. 토큰은 로그나 {@code toString}에 노출하지 않는다. */
@Component
public class PostHogProperties {

    private final boolean enabled;
    private final String projectToken;
    private final URI host;
    private final Path outboxPath;

    public PostHogProperties(
            @Value("${discount.posthog.enabled:false}") boolean enabled,
            @Value("${discount.posthog.project-token:}") String projectToken,
            @Value("${discount.posthog.host:https://us.i.posthog.com}") String host,
            @Value("${discount.posthog.outbox-path:data/posthog-outbox}") String outboxPath) {
        this.enabled = enabled;
        this.projectToken = projectToken == null ? "" : projectToken.trim();
        this.host = validateHost(host);
        this.outboxPath = Path.of(outboxPath);

        if (enabled && this.projectToken.isBlank()) {
            throw new IllegalStateException(
                    "discount.posthog.enabled=true지만 POSTHOG_PROJECT_TOKEN이 비어 있다");
        }
    }

    private static URI validateHost(String value) {
        URI uri;
        try {
            uri = URI.create(value == null ? "" : value.trim());
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("올바르지 않은 PostHog host", ex);
        }
        if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                || uri.getHost() == null) {
            throw new IllegalStateException("PostHog host는 http 또는 https URL이어야 한다");
        }
        return uri;
    }

    public boolean enabled() {
        return enabled;
    }

    String projectToken() {
        return projectToken;
    }

    URI host() {
        return host;
    }

    Path outboxPath() {
        return outboxPath;
    }
}
