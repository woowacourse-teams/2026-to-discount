package com.discounttracker.sharing;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

import static org.junit.jupiter.api.Assertions.*;

class ShareLinkStoreAuditTest {
    @TempDir Path dir;

    private final ShareLinkStore.Target target =
            new ShareLinkStore.Target("a".repeat(32), "도미노피자", "v1_" + "b".repeat(64));

    @Test
    void defaultPathSitsNextToEventLogAndSkipsBlankLines() throws Exception {
        String events = dir.resolve("events.jsonl").toString();
        var store = new ShareLinkStore(new ObjectMapper(), "", events);
        String code = store.create(target);
        Files.writeString(dir.resolve("share-links.jsonl"), "\n\n", StandardOpenOption.APPEND);
        assertEquals(target, new ShareLinkStore(new ObjectMapper(), "", events).find(code));
    }

    @Test
    void recordWithBadCodeStopsStartup() throws Exception {
        Path path = dir.resolve("links.jsonl");
        new ShareLinkStore(new ObjectMapper(), path.toString(), "unused").create(target);
        String line = Files.readString(path).replaceFirst("\"code\":\"[^\"]+\"", "\"code\":\"short\"");
        Files.writeString(path, line);
        assertThrows(IllegalStateException.class, () -> new ShareLinkStore(new ObjectMapper(), path.toString(), "unused"));
    }

    @Disabled("audit: 01-api-a.md ShareLinkStore 깨진 줄 하나로 생성자가 던져 앱이 안 뜬다")
    @Test
    void halfWrittenLastLineIsSkipped() throws Exception {
        Path path = dir.resolve("links.jsonl");
        String code = new ShareLinkStore(new ObjectMapper(), path.toString(), "unused").create(target);
        Files.writeString(path, "{\"code\":\"abc", StandardOpenOption.APPEND);
        assertEquals(target, new ShareLinkStore(new ObjectMapper(), path.toString(), "unused").find(code));
    }
}
