package com.discounttracker.analytics;

import com.discounttracker.storage.InterProcessFileLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 설문 열기와 대상 문턱의 정본 {@code survey-settings.json}(설계 317).
 *
 * <p>{@link #current()}는 부를 때마다 파일의 수정 시각과 크기만 보고, 바뀌었으면 다시
 * 읽는다. 재시작이 필요 없다. 파일이 없으면 환경변수가 기본값이다. 깨진 파일은 닫힘으로
 * 본다 — 기프티콘이 걸린 판정이라 잘못 열리는 것은 되돌릴 수 없고, 잘못 닫히는 것은
 * 콘솔에서 다시 저장하면 끝난다. 깨진 것을 "파일 없음"과 같게 다루지 않고
 * {@link Snapshot#source()}가 {@code broken}으로 알린다.
 */
@Component
public class SurveySettings {

    private static final Logger log = LoggerFactory.getLogger(SurveySettings.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final Duration LOCK_TIMEOUT = Duration.ofSeconds(5);

    /** 다섯 칸과 수정 정보. 환경변수 기본값이면 수정 정보는 null이다. */
    public record Values(boolean open, int minDays, int minConversions, int recentDays, int minSpanDays,
                         String updatedAt, String updatedBy) {}

    /** source: env(파일 없음), file, broken(못 읽음). version은 PUT이 되돌려 보내는 낙관적 잠금 값이다. */
    public record Snapshot(Values values, String source, String problem, String version) {}

    /** 쓰기 때 {@code version}이 지금 파일과 다르다. */
    public static class VersionConflict extends RuntimeException {
        VersionConflict() {
            super("다른 사람이 먼저 바꿨습니다");
        }
    }

    /** 칸 이름을 단 검증 실패. */
    public static class Invalid extends RuntimeException {
        Invalid(String message) {
            super(message);
        }
    }

    private final ObjectMapper mapper = JsonMapper.builderWithJackson2Defaults().build();
    private final Path file;
    private final Path logFile;
    private final Path lockFile;
    private final Values env;

    private Snapshot cached;
    private String cachedStamp;   // "" = 파일 없음
    private String lastReportedBroken;

    @Autowired
    public SurveySettings(
            @Value("${discount.survey.settings-path:}") String settingsPath,
            @Value("${discount.event-log-path:data/events.jsonl}") String eventLogPath,
            @Value("${discount.survey.open:false}") boolean open,
            @Value("${discount.survey.min-days:" + SurveyEligibility.MIN_DAYS + "}") int minDays,
            @Value("${discount.survey.min-conversions:" + SurveyEligibility.MIN_CONVERSIONS + "}") int minConversions,
            @Value("${discount.survey.recent-days:0}") int recentDays,
            @Value("${discount.survey.min-span-days:0}") int minSpanDays) {
        // 따로 안 정하면 이벤트 원장 옆에 둔다. 상대 경로 기본값은 운영 작업 폴더에 못 써 500이 났다(2026-10-19).
        this(settingsPath.isBlank()
                        ? Path.of(eventLogPath).toAbsolutePath().resolveSibling("survey-settings.json")
                        : Path.of(settingsPath),
                new Values(open, minDays, minConversions, recentDays, minSpanDays, null, null));
    }

    SurveySettings(Path file, Values env) {
        this.file = file;
        this.env = env;
        this.logFile = file.resolveSibling("survey-settings.log.jsonl");
        this.lockFile = file.resolveSibling(file.getFileName() + ".lock");
        log.info("설문 설정 파일 {} — 없으면 환경변수: 열림 {}, 접속일 {}, 전환 {}, 최근 {}일, 사용 {}일",
                file, env.open(), env.minDays(), env.minConversions(), env.recentDays(), env.minSpanDays());
    }

    /** 지금 유효한 설정. 파일이 바뀌었으면 다시 읽는다. */
    public synchronized Snapshot current() {
        String stamp = stamp();
        if (cached == null || !stamp.equals(cachedStamp)) {
            cached = read(stamp);
            cachedStamp = stamp;
        }
        return cached;
    }

    /**
     * 저장한다. 순서: 락, version 대조, 기록 한 줄, 설정 파일(tmp 뒤 ATOMIC_MOVE), 메모리.
     * 기록을 먼저 쓰는 이유는 설정은 바뀌었는데 기록이 없는 상태를 만들지 않으려는 것이다.
     *
     * @throws VersionConflict version이 지금 파일과 다를 때
     */
    public synchronized Snapshot save(Values next, String expectedVersion, String by) throws IOException {
        return InterProcessFileLock.withOperationsWrite(() ->
                InterProcessFileLock.withLock(lockFile, LOCK_TIMEOUT, () -> saveLocked(next, expectedVersion, by)));
    }

    private Snapshot saveLocked(Values next, String expectedVersion, String by) throws IOException {
        Snapshot before = read(stamp());   // 락 안에서 새로 읽는다. 다른 인스턴스가 바꿨을 수 있다.
        if (!before.version().equals(expectedVersion)) throw new VersionConflict();

        String at = OffsetDateTime.now(KST).withNano(0).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        Values after = new Values(next.open(), next.minDays(), next.minConversions(), next.recentDays(),
                next.minSpanDays(), at, by);
        appendLog(at, by, before, after, true);   // 기록이 먼저다. 못 쓰면 설정도 바꾸지 않는다.
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, toJson(after, true).toPrettyString(), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException | RuntimeException e) {
            log.error("설문 설정을 파일에 쓰지 못했다: {}", file, e);
            try {
                appendLog(at, by, before, after, false);
            } catch (IOException ignored) {
                // 이미 실패를 알리는 중이다.
            }
            throw e;
        }
        cachedStamp = null;   // 같은 프로세스는 그 자리에서 새 값을 본다.
        Snapshot now = current();
        log.info("설문 설정 변경 by={} before={}({}) after={}", by, before.values(), before.source(), now.values());
        return now;
    }

    private void appendLog(String at, String by, Snapshot before, Values after, boolean applied) throws IOException {
        ObjectNode line = mapper.createObjectNode();
        line.put("at", at);
        line.put("by", by);
        line.set("before", toJson(before.values(), false));
        line.set("after", toJson(after, false));
        line.put("beforeSource", before.source());
        line.put("applied", applied);
        Files.createDirectories(logFile.toAbsolutePath().getParent());
        Files.writeString(logFile, mapper.writeValueAsString(line) + "\n", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
    }

    // --- 읽기 ---

    private String stamp() {
        try {
            if (!Files.exists(file)) return "";
            return Files.getLastModifiedTime(file).toMillis() + "-" + Files.size(file);
        } catch (IOException e) {
            return "unreadable";
        }
    }

    private Snapshot read(String stamp) {
        if (stamp.isEmpty()) return new Snapshot(env, "env", null, "env");
        String version = stamp;
        try {
            JsonNode n = mapper.readTree(Files.readString(file, StandardCharsets.UTF_8));
            Values v = parse(n);
            return new Snapshot(new Values(v.open(), v.minDays(), v.minConversions(), v.recentDays(),
                    v.minSpanDays(), text(n, "updatedAt"), text(n, "updatedBy")), "file", null, version);
        } catch (Invalid e) {
            return broken(version, e.getMessage());
        } catch (JacksonException e) {   // Jackson 3 파싱 오류는 IOException이 아니다(ADR-012).
            return broken(version, "JSON이 깨짐: " + e.getOriginalMessage());
        } catch (IOException e) {
            return broken(version, "파일을 못 읽음: " + e.getMessage());
        }
    }

    private Snapshot broken(String version, String problem) {
        if (!version.equals(lastReportedBroken)) {   // 같은 파일이면 한 번만 알린다.
            lastReportedBroken = version;
            log.error("설문 설정 파일이 깨져 닫힘으로 본다: {} — {}", file, problem);
        }
        Values closed = new Values(false, env.minDays(), env.minConversions(), env.recentDays(),
                env.minSpanDays(), null, null);
        return new Snapshot(closed, "broken", problem, version);
    }

    // --- 검증 ---

    /** 다섯 칸이 전부 있고 정수(open은 불리언)이며 범위 안이어야 한다. 빠진 칸을 환경변수로 메우지 않는다. */
    static Values parse(JsonNode n) {
        if (n == null || !n.isObject()) throw new Invalid("JSON 객체가 아님");
        if (!n.hasNonNull("open") || !n.get("open").isBoolean()) throw new Invalid("open 없음 또는 불리언 아님");
        return new Values(n.get("open").asBoolean(),
                integer(n, "minDays"), integer(n, "minConversions"),
                integer(n, "recentDays"), integer(n, "minSpanDays"), null, null);
    }

    /** 대상 수 미리보기용 문턱 하나의 범위 검사. */
    static int checkRange(String name, int value) {
        int[] r = range(name);
        if (value < r[0] || value > r[1]) throw new Invalid(name + " 범위 밖: " + value + " (" + r[0] + "~" + r[1] + ")");
        return value;
    }

    private static int[] range(String name) {
        return switch (name) {
            case "minDays" -> new int[]{1, 365};
            case "minConversions" -> new int[]{0, 1000};
            case "recentDays", "minSpanDays" -> new int[]{0, 365};
            default -> throw new IllegalArgumentException(name);
        };
    }

    private static int integer(JsonNode n, String name) {
        JsonNode v = n.get(name);
        if (v == null || v.isNull()) throw new Invalid(name + " 없음");
        if (!v.isIntegralNumber() || !v.canConvertToInt()) throw new Invalid(name + " 정수 아님: " + v);
        return checkRange(name, v.asInt());
    }

    private static String text(JsonNode n, String name) {
        JsonNode v = n.get(name);
        return v == null || v.isNull() ? null : v.asString();
    }

    private ObjectNode toJson(Values v, boolean withMeta) {
        ObjectNode o = mapper.createObjectNode();
        o.put("open", v.open());
        o.put("minDays", v.minDays());
        o.put("minConversions", v.minConversions());
        o.put("recentDays", v.recentDays());
        o.put("minSpanDays", v.minSpanDays());
        if (withMeta) {
            o.put("updatedAt", v.updatedAt());
            o.put("updatedBy", v.updatedBy());
        }
        return o;
    }
}
