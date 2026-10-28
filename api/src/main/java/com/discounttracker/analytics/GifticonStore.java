package com.discounttracker.analytics;

import com.discounttracker.storage.InterProcessFileLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 기프티콘 코드를 담아 두고 하나씩 꺼내 준다.
 *
 * <p>프론트 번들에 넣지 않는 이유는 명백하다 — 값을 가진 문자열이라 누구나
 * 읽어 간다. 저장소에도 올리지 않는다({@code .gitignore}). 경로만 열어두고
 * ({@code discount.gifticons-path}) 파일은 서버에 직접 올린다 —
 * {@code banners.yml}·{@code export.json}과 같은 방식이다(ADR-001).
 *
 * <p>발급은 두 번 나가면 안 된다. 무중단 배포(#188) 때 두 인스턴스가 10~20초 같은
 * 데이터 폴더를 쓰므로 JVM 안의 {@code synchronized}로는 부족하다. 발급은
 * {@code <gifticons.yml>.lock}의 파일 락 안에서 한다(#192, {@link InterProcessFileLock}).
 * 이 락을 걷어 내면 두 인스턴스가 같은 코드를 두 사람에게 줄 수 있다.
 */
@Component
public class GifticonStore {

    private static final Logger log = LoggerFactory.getLogger(GifticonStore.class);

    /**
     * 발급 원장. {@code gifticons.yml}은 제자리에서 다시 쓰이는 파일이라
     * 통째로 갈리면 누가 무엇을 받았는지가 함께 사라진다 — 2026-09-02
     * 21:12 이후 실제로 그렇게 날아가, 비어 보이게 된 자리가 다음 사람에게
     * 재발급됐다(같은 링크가 두 사람에게 나갔다). 그래서 발급 사실만 따로
     * append-only로 남긴다.
     *
     * <p>{@code events.jsonl}에 안 적는다. 그 원장의 props는 PostHog로
     * 그대로 전달돼(PostHogEventMapper) 기프티콘 링크가 서드파티에 닿는다.
     */
    private static final String ISSUES_FILE = "gifticon-issues.jsonl";

    private static final Duration LOCK_TIMEOUT = Duration.ofSeconds(5);

    private final Path path;
    private final Path issuesPath;
    private final Path lockPath;

    public GifticonStore(@Value("${discount.gifticons-path:data/gifticons.yml}") String path) {
        this.path = Path.of(path);
        Path dir = this.path.toAbsolutePath().getParent();
        this.issuesPath = (dir == null ? Path.of("") : dir).resolve(ISSUES_FILE);
        this.lockPath = this.path.resolveSibling(this.path.getFileName() + ".lock");
    }

    Path path() {
        return path;
    }

    /** 아직 아무에게도 안 나간 코드 수. 0이면 프론트가 설문을 안 그린다. */
    public int remaining() {
        return (int) read().stream().filter(g -> g.get("issuedTo") == null).count();
    }

    /**
     * 코드 하나를 꺼내 발급 표시를 하고 돌려준다.
     *
     * <p>받았는지 확인 → 읽기 → 표시 → 쓰기 → 원장이 한 덩어리라야 한다. 나눠 두면
     * 두 요청(두 프로세스 포함)이 같은 코드를 집는다. 파일 락으로 묶고, 파일에 다 쓴
     * 뒤에야 코드를 돌려준다 — 먼저 돌려주고 쓰다 실패하면 같은 코드가 다음 사람에게도 간다.
     * 락을 못 잡아도 코드를 내주지 않는다.
     */
    public Optional<String> issue(String visitorId) {
        try {
            return InterProcessFileLock.withLock(lockPath, LOCK_TIMEOUT, () -> issueLocked(visitorId));
        } catch (IOException e) {
            log.error("기프티콘 발급 락을 잡지 못했다 — 코드를 내주지 않는다: {}", lockPath, e);
            return Optional.empty();
        }
    }

    private Optional<String> issueLocked(String visitorId) {
        // 이미 받은 사람에게는 그때 그 코드를 그대로 돌려준다. 재고를 또
        // 먹지 않고, 한 사람이 코드를 둘 쥐는 일도 없다.
        Optional<String> held = issuedTo(visitorId);
        if (held.isPresent()) return held;

        List<Map<String, Object>> all = read();
        for (Map<String, Object> g : all) {
            if (g.get("issuedTo") != null) continue;
            Object code = g.get("code");
            if (code == null) continue;

            g.put("issuedTo", visitorId);
            g.put("issuedAt", OffsetDateTime.now(Clock.systemDefaultZone()).toString());
            try {
                write(all);
            } catch (IOException e) {
                // 못 적었으면 발급하지 않은 것으로 둔다. 코드를 주고 기록을
                // 못 남기면 같은 코드가 다음 사람에게도 나간다.
                log.error("기프티콘 발급 기록에 실패했다 — 코드를 내주지 않는다: {}", path, e);
                return Optional.empty();
            }
            recordIssue(visitorId, String.valueOf(code));
            return Optional.of(String.valueOf(code));
        }
        return Optional.empty();
    }

    /** 이 사람 앞으로 이미 나간 코드. 없으면 비어 있다. */
    public Optional<String> issuedTo(String visitorId) {
        if (visitorId == null || visitorId.isBlank()) return Optional.empty();
        for (Map<String, Object> g : read()) {
            if (visitorId.equals(g.get("issuedTo")) && g.get("code") != null) {
                return Optional.of(String.valueOf(g.get("code")));
            }
        }
        return Optional.empty();
    }

    /**
     * 발급 한 줄을 append-only로 남긴다.
     *
     * <p>실패해도 발급을 되돌리지 않는다 — 코드는 이미 yml에 박혔고, 여기서
     * 예외를 올리면 사용자가 코드를 못 받는다. 대신 로그로 사람이 맞춘다.
     */
    private void recordIssue(String visitorId, String code) {
        String line = String.format("{\"ts\":\"%s\",\"visitorId\":\"%s\",\"code\":\"%s\"}%n",
                OffsetDateTime.now(Clock.systemDefaultZone()), visitorId, code);
        try {
            Files.writeString(issuesPath, line, StandardCharsets.UTF_8,
                    java.nio.file.StandardOpenOption.CREATE,
                    java.nio.file.StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.error("발급 원장에 못 남겼다 — visitorId={} code={} 경로={}",
                    visitorId, code, issuesPath, e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> read() {
        // 파일이 없는 것은 오류가 아니다 — 아직 안 올렸거나 다 소진한 상태다.
        // 어느 쪽이든 "남은 코드 0"이고, 그러면 설문이 저절로 내려간다.
        if (!Files.exists(path)) return List.of();
        try (InputStream in = Files.newInputStream(path)) {
            Object loaded = new Yaml().load(in);
            if (!(loaded instanceof Map<?, ?> root)) return List.of();
            Object list = root.get("gifticons");
            if (!(list instanceof List<?> raw)) return List.of();

            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : raw) {
                if (item instanceof Map<?, ?> m) out.add(new LinkedHashMap<>((Map<String, Object>) m));
            }
            return out;
        } catch (IOException | RuntimeException e) {
            log.error("gifticons.yml을 읽지 못했다 — 남은 코드 0으로 본다: {}", path, e);
            return List.of();
        }
    }

    private void write(List<Map<String, Object>> all) throws IOException {
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setAllowUnicode(true);
        String text = new Yaml(options).dump(Map.of("gifticons", all));

        if (path.getParent() != null) Files.createDirectories(path.getParent());
        // 임시 파일에 다 쓴 뒤 옮긴다. 쓰는 도중에 죽어도 원본이 반쪽으로
        // 남지 않는다 — 반쪽이면 남은 코드가 통째로 날아간다.
        Path tmp = path.resolveSibling(path.getFileName() + ".tmp");
        Files.writeString(tmp, text, StandardCharsets.UTF_8);
        // ATOMIC_MOVE: 락 없이 읽는 remaining·issuedTo가 반쪽 파일을 보지 않게 한다.
        Files.move(tmp, path, java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                java.nio.file.StandardCopyOption.ATOMIC_MOVE);
    }
}
