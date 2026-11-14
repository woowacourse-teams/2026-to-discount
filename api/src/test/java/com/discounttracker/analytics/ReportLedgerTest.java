package com.discounttracker.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ReportLedgerTest {

    private static final String A = "v_aaaaaaaaaaaaaaaa";

    @TempDir Path tmp;
    Path reports;
    Path statusFile;
    ReportLedger ledger;

    @BeforeEach
    void setUp() {
        reports = tmp.resolve("reports.jsonl");
        statusFile = tmp.resolve("report-status.jsonl");
        ledger = new ReportLedger(new ObjectMapper(), reports);
    }

    private static String row(String at, String visitor) {
        return "{\"at\":\"" + at + "\",\"type\":\"amount\",\"text\":\"t\",\"brand\":\"BBQ\",\"visitorId\":\"" + visitor + "\"}";
    }

    private void copyLegacy() throws IOException {
        Files.copy(Path.of("src/test/resources/reports/legacy-reports.jsonl"), reports);
    }

    @Test
    void idMatchesAppendedLine() throws IOException {
        String line = row("2026-11-04T00:00:00Z", A);
        String id = ledger.append(line);
        assertEquals(id, ledger.recent(10).get(0).id());
        assertEquals(id, ReportLedger.idOf(line));
        assertTrue(id.matches("^r_[0-9a-f]{16}$"));
    }

    @Test
    void legacyRowsAreReceived() throws IOException {
        copyLegacy();
        var mine = ledger.mine(A, 50);
        assertEquals(2, mine.size());
        assertTrue(mine.stream().allMatch(e -> e.status().equals("received")));
        assertEquals(3, ledger.recent(50).size());
        assertTrue(ledger.mine("v_bbbbbbbbbbbbbbbb", 50).isEmpty());
    }

    @Test
    void lastStatusWins() throws IOException {
        String id = ledger.append(row("2026-11-04T00:00:00Z", A));
        ledger.setStatus(id, "reviewing", "kim");
        assertEquals("applied", ledger.setStatus(id, "applied", "lee").orElseThrow().status());
        assertEquals("applied", ledger.mine(A, 50).get(0).status());
        List<String> lines = Files.readAllLines(statusFile, StandardCharsets.UTF_8);
        assertEquals(2, lines.size());
        assertTrue(lines.get(0).contains("\"by\":\"kim\"") && lines.get(1).contains("\"by\":\"lee\""));
    }

    @Test
    void unknownIdWritesNothing() throws IOException {
        ledger.append(row("2026-11-04T00:00:00Z", A));
        assertTrue(ledger.setStatus("r_0000000000000000", "applied", "kim").isEmpty());
        assertFalse(Files.exists(statusFile));
    }

    @Test
    void brokenLinesAreSkipped() throws IOException {
        String id = ledger.append(row("2026-11-04T00:00:00Z", A));
        Files.writeString(reports, "{\"at\":\"2026-11-05T00:00:00Z\",\"tex", StandardCharsets.UTF_8,
                StandardOpenOption.APPEND);
        ledger.setStatus(id, "reviewing", "kim");
        Files.writeString(statusFile, "{\"id\":\"" + id + "\",\"status\":\"done\"}\n{\"id\":\"r_",
                StandardCharsets.UTF_8, StandardOpenOption.APPEND);
        var mine = ledger.mine(A, 50);
        assertEquals(1, mine.size());
        assertEquals("reviewing", mine.get(0).status());
    }

    @Test
    void sortsByInstantAndCaps() throws IOException {
        ledger.append(row("2026-11-04T00:00:45Z", A));
        ledger.append(row("2026-11-04T00:00:45.1Z", A));
        assertEquals("2026-11-04T00:00:45.1Z", ledger.recent(10).get(0).rawAt());
        for (int i = 0; i < 50; i++) ledger.append(row("2026-11-05T00:00:%02dZ".formatted(i), A));
        var all = ledger.mine(A, 50);
        assertEquals(50, all.size());
        assertTrue(all.stream().noneMatch(e -> e.rawAt().startsWith("2026-11-04")));
    }

    @Test
    void missingIsEmptyButUnreadableThrows() throws IOException {
        assertTrue(ledger.recent(10).isEmpty());
        Files.createDirectory(reports);
        assertThrows(IOException.class, () -> ledger.recent(10));
        Files.delete(reports);
        ledger.append(row("2026-11-04T00:00:00Z", A));
        Files.createDirectory(statusFile);
        assertThrows(IOException.class, () -> ledger.mine(A, 10));
    }
}
