package com.discounttracker.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class PushStateStoreMultiProcessTest {
    @TempDir Path temp;

    @Test
    void fourProcessesKeepEveryWrite() throws Exception {
        Path state = temp.resolve("push.json");

        MultiProcess.run("push", state, temp, 4, 25);

        JsonNode root = new ObjectMapper().readTree(Files.readString(state));
        assertThat(root.get("subscriptions").size()).isEqualTo(100);
        assertThat(root.get("delivered").size()).isEqualTo(100);
        assertThat(root.get("tokens").size()).isEqualTo(100);
    }
}
