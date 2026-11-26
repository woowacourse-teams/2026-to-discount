package com.discounttracker.history;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class HistoryRepositoryAuditTest {

    private static final String GOOD = """
            {"days":[{"date":"2026-10-08","platform":"coupangeats","brand":"청년피자","state":"published","max":10000}],
             "coverage":[{"date":"2026-10-08","platforms":["coupangeats"]}],
             "firstCome":[{"date":"2026-10-08","platforms":{"coupangeats":2}}]}
            """;

    private static OfferHistory.Novelty novelty(HistoryRepository repo) {
        return repo.current().novelty("coupangeats", "청년피자", 10000, LocalDate.parse("2026-10-09"));
    }

    /** 같은 객체가 읽을 때마다 다른 내용을 내준다. */
    private static final class Swappable extends ByteArrayResource {
        String body;
        Swappable(String body) { super(new byte[0]); this.body = body; }
        @Override public InputStream getInputStream() throws IOException {
            return new java.io.ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Test
    void missingFileGivesEmptyHistoryAndFalse() {
        var repo = new HistoryRepository(new FileSystemResource("build/tmp/no-such-history.json"));
        assertFalse(repo.reload());
        assertNotEquals(OfferHistory.Novelty.NOT_NEW, novelty(repo));
    }

    @Test
    void readsFirstComeCounts() {
        var repo = new HistoryRepository(new ByteArrayResource(GOOD.getBytes(StandardCharsets.UTF_8)));
        assertTrue(repo.reload());
        assertEquals(OfferHistory.Novelty.NOT_NEW, novelty(repo));
    }

    @Test
    void brokenJsonGivesEmptyHistoryAndFalse() {
        var repo = new HistoryRepository(new ByteArrayResource("{not json".getBytes(StandardCharsets.UTF_8)));
        assertFalse(repo.reload());
        assertNotEquals(OfferHistory.Novelty.NOT_NEW, novelty(repo));
    }

    @Disabled("audit: 02-api-b.md HistoryRepository 행 하나에 brand가 빠지면 NPE로 이력 전체를 버린다")
    @Test
    void rowMissingBrandIsSkippedOnly() {
        String json = GOOD.replace("\"days\":[", "\"days\":[{\"date\":\"2026-10-08\",\"platform\":\"baemin\"},");
        var repo = new HistoryRepository(new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
        assertTrue(repo.reload());
        assertEquals(OfferHistory.Novelty.NOT_NEW, novelty(repo));
    }

    @Disabled("audit: 02-api-b.md HistoryRepository 읽기 실패 시 이전 정상 이력까지 버린다")
    @Test
    void failedReloadKeepsPreviousHistory() {
        Resource res = new Swappable(GOOD);
        var repo = new HistoryRepository(res);
        assertTrue(repo.reload());
        ((Swappable) res).body = "{not json";
        assertFalse(repo.reload());
        assertEquals(OfferHistory.Novelty.NOT_NEW, novelty(repo));
    }
}
