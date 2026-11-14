package com.discounttracker.analytics;

import com.discounttracker.storage.InterProcessFileLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 제보 원장({@code reports.jsonl})과 상태 원장({@code report-status.jsonl}).
 *
 * <p>이 두 파일은 추가 전용이다. 제보 번호는 저장된 줄의 SHA-256 앞 16자라서
 * {@code reports.jsonl}을 다시 포맷하면 번호가 바뀌고 상태가 {@code received}로 돌아간다.
 *
 * <p>요청마다 두 파일을 처음부터 읽는다. 제보는 한 사람 하루 20건 제한이라 작다.
 * 커지면 ADR-011(증분 읽기)을 따른다.
 */
@Component
public class ReportLedger {

    private static final Logger log = LoggerFactory.getLogger(ReportLedger.class);

    // 웹 report.test.js가 이 줄을 정규식으로 읽어 키를 맞댄다. 한 줄로 둔다.
    static final List<String> STATUSES = List.of("received", "reviewing", "applied", "declined");

    /** {@code rawAt}은 저장 문자열 그대로(응답에 싣는다). {@code at}은 못 읽으면 null. */
    record Entry(String id, Instant at, String rawAt, JsonNode row, String status) {
        String text(String key) {
            JsonNode n = row.get(key);
            return n == null || !n.isString() ? null : n.asString();
        }
    }

    private final ObjectMapper mapper;
    private final Path reportPath;
    private final Path statusPath;

    @org.springframework.beans.factory.annotation.Autowired
    public ReportLedger(ObjectMapper mapper,
                        @Value("${discount.report.path:}") String reportPath,
                        @Value("${discount.event-log-path:data/events.jsonl}") String eventLogPath) {
        // 따로 안 정하면 이벤트 원장 옆에 둔다. 상대 경로 기본값은 운영 작업 폴더에 못 써 500이 났다(2026-10-19).
        this(mapper, reportPath.isBlank()
                ? Path.of(eventLogPath).toAbsolutePath().resolveSibling("reports.jsonl")
                : Path.of(reportPath));
    }

    ReportLedger(ObjectMapper mapper, Path reportPath) {
        this.mapper = mapper;
        this.reportPath = reportPath;
        this.statusPath = reportPath.resolveSibling("report-status.jsonl");
    }

    /** 줄을 덧붙이고 제보 번호를 돌려준다. */
    synchronized String append(String line) throws IOException {
        write(reportPath, line);
        return idOf(line);
    }

    static String idOf(String line) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(line.getBytes(StandardCharsets.UTF_8));
            return "r_" + HexFormat.of().formatHex(d).substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 없음", e);
        }
    }

    List<Entry> mine(String visitorId, int limit) throws IOException {
        return load(limit, e -> visitorId.equals(e.text("visitorId")));
    }

    List<Entry> recent(int limit) throws IOException {
        return load(limit, e -> true);
    }

    /** 그 번호의 제보가 없으면 비어 있고 아무것도 쓰지 않는다. */
    synchronized Optional<Entry> setStatus(String id, String status, String by) throws IOException {
        Optional<Entry> found = load(Integer.MAX_VALUE, e -> e.id().equals(id)).stream().findFirst();
        if (found.isEmpty()) return Optional.empty();
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("at", Instant.now().toString());
        row.put("id", id);
        row.put("status", status);
        row.put("by", by);
        write(statusPath, mapper.writeValueAsString(row));
        Entry e = found.get();
        return Optional.of(new Entry(e.id(), e.at(), e.rawAt(), e.row(), status));
    }

    private void write(Path path, String line) throws IOException {
        InterProcessFileLock.withOperationsWrite(() -> {
            Path parent = path.toAbsolutePath().getParent();
            if (parent != null) Files.createDirectories(parent);
            Files.writeString(path, line + "\n", StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            return null;
        });
    }

    private List<Entry> load(int limit, java.util.function.Predicate<Entry> keep) throws IOException {
        // 없음은 빈 목록, 있는데 못 읽음은 IOException 그대로(전부 received로 내지 않는다).
        if (!Files.exists(reportPath)) return List.of();
        Map<String, String> statuses = statuses();
        List<String> lines = Files.readAllLines(reportPath, StandardCharsets.UTF_8);
        List<Entry> out = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            if (line.isBlank()) continue;
            JsonNode row = parse(line, i + 1, reportPath);
            if (row == null) continue;
            String id = idOf(line);
            JsonNode at = row.get("at");
            String rawAt = at != null && at.isString() ? at.asString() : null;
            Entry e = new Entry(id, instant(rawAt), rawAt, row, statuses.getOrDefault(id, "received"));
            if (keep.test(e)) out.add(e);
        }
        // 추가 전용이라 뒤가 최신: 뒤집은 뒤 안정 정렬하면 같은 시각은 뒤쪽이 앞.
        // 문자열 비교는 소수 자릿수가 달라(…45Z, …45.1Z) 시간 순서와 어긋난다.
        java.util.Collections.reverse(out);
        out.sort(Comparator.comparing(Entry::at, Comparator.nullsLast(Comparator.<Instant>reverseOrder())));
        return out.size() > limit ? List.copyOf(out.subList(0, limit)) : out;
    }

    private Map<String, String> statuses() throws IOException {
        Map<String, String> map = new HashMap<>();
        if (!Files.exists(statusPath)) return map;
        List<String> lines = Files.readAllLines(statusPath, StandardCharsets.UTF_8);
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).isBlank()) continue;
            JsonNode row = parse(lines.get(i), i + 1, statusPath);
            if (row == null || !row.path("id").isString() || !row.path("status").isString()) continue;
            String s = row.get("status").asString();
            if (STATUSES.contains(s)) map.put(row.get("id").asString(), s); // 마지막 행이 이긴다
        }
        return map;
    }

    private JsonNode parse(String line, int number, Path file) {
        try {
            JsonNode n = mapper.readTree(line);
            if (n != null && n.isObject()) return n;
        } catch (JacksonException ignored) {
            // 아래에서 같이 경고한다
        }
        // 줄 내용은 본문이 들어 있어 싣지 않는다.
        log.warn("report line {} unreadable in {}", number, file.getFileName());
        return null;
    }

    private static Instant instant(String raw) {
        if (raw == null) return null;
        try {
            return Instant.parse(raw);
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
    }
}
