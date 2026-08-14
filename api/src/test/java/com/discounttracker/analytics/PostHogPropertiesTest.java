package com.discounttracker.analytics;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PostHogPropertiesTest {

    @Test
    void enabledForwardingRequiresProjectToken(@TempDir Path dir) {
        assertThrows(IllegalStateException.class,
                () -> new PostHogProperties(true, "", "https://us.i.posthog.com",
                        dir.toString()));
    }

    @Test
    void enabledForwardingRequiresExplicitOutboxPath() {
        assertThrows(IllegalStateException.class,
                () -> new PostHogProperties(true, "token", "https://us.i.posthog.com", ""));
    }

    @Test
    void disabledForwardingCanStartWithoutTokenOrOutboxPath() {
        assertDoesNotThrow(() -> new PostHogProperties(false, "",
                "https://us.i.posthog.com", ""));
    }
}
