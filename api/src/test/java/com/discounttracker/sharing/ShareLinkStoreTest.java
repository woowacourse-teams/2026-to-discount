package com.discounttracker.sharing;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class ShareLinkStoreTest {
    @TempDir Path dir;
    @Test void persistsAndResolvesExactTargetAfterRestart() throws Exception {
        String path = dir.resolve("links.jsonl").toString();
        var target = new ShareLinkStore.Target("a".repeat(32), "도미노피자", "v1_" + "b".repeat(64));
        var first = new ShareLinkStore(new ObjectMapper(), path, "unused");
        String code = first.create(target);
        assertTrue(code.matches("[A-Za-z0-9_-]{16}"));
        assertEquals(code, first.create(target));
        var restarted = new ShareLinkStore(new ObjectMapper(), path, "unused");
        assertEquals(target, restarted.find(code));
        assertEquals(code, restarted.create(target));
        assertNull(restarted.find("missing"));
        assertNotEquals(code, restarted.create(new ShareLinkStore.Target("c".repeat(32), target.brand(), target.offerKey())));
    }
    @Test void rejectsInvalidTargets() throws Exception {
        var store = new ShareLinkStore(new ObjectMapper(), dir.resolve("links").toString(), "unused");
        assertThrows(IllegalArgumentException.class, () -> store.create(new ShareLinkStore.Target("bad", "브랜드", "v1_" + "b".repeat(64))));
        assertFalse(new ShareLinkStore.Target("a".repeat(32), "\n", "v1_" + "b".repeat(64)).valid());
    }
}
