package com.discounttracker.analytics;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * 원장 집계의 요약 스냅샷(2026-10-16). 재시작 때 원장 전체(N줄)를 다시 읽지 않도록 집계 상태와 읽은 자리를
 * 원장 옆 파일({@code events.jsonl.<이름>.snapshot.json})에 둔다. 스냅샷은 원장에서 다시 만들 수 있는 캐시일 뿐이다 —
 * 원장은 읽기만 하고, 스냅샷이 없거나 깨졌거나 버전·원장과 안 맞으면 경고하고 처음부터 읽는다.
 *
 * <p>원장과 맞는지는 두 가지로 본다: 자리가 원장 크기 이하인가, 원장 앞 4KB(자리가 그보다 작으면 자리까지)의
 * 해시가 같은가. 같은 크기 이상으로 갈아끼운 원장도 앞부분이 다르면 걸러진다.
 */
final class EventLogSnapshot {

    private static final Logger log = LoggerFactory.getLogger(EventLogSnapshot.class);
    private static final int HEAD = 4096;
    static final ObjectMapper MAPPER = JsonMapper.builder().build();

    private final Path file;
    private final Path logPath;
    private final int version;

    EventLogSnapshot(Path logPath, String name, int version) {
        this.logPath = logPath;
        this.file = logPath.resolveSibling(logPath.getFileName() + "." + name + ".snapshot.json");
        this.version = version;
    }

    Path file() {
        return file;
    }

    /** 맞는 스냅샷이 있으면 그 {@code state}와 {@code offset}을 담은 노드, 아니면 null(경고 로그). */
    JsonNode load() {
        if (!Files.exists(file)) {
            log.warn("스냅샷 없음, 원장을 처음부터 읽는다: {}", file);
            return null;
        }
        try {
            JsonNode n = MAPPER.readTree(Files.readAllBytes(file));
            if (n.path("version").asInt(-1) != version) {
                log.warn("스냅샷 버전이 다르다({} != {}), 처음부터 읽는다: {}", n.path("version").asInt(-1), version, file);
                return null;
            }
            long offset = n.path("offset").asLong(-1);
            long size = Files.exists(logPath) ? Files.size(logPath) : 0;
            if (offset < 0 || offset > size) {
                log.warn("스냅샷 자리({})가 원장 크기({})를 넘는다(갈아끼움), 처음부터 읽는다: {}", offset, size, file);
                return null;
            }
            if (!head(offset).equals(n.path("head").asString(""))) {
                log.warn("스냅샷과 원장 앞부분이 다르다(갈아끼움), 처음부터 읽는다: {}", file);
                return null;
            }
            if (!n.path("state").isObject()) {
                log.warn("스냅샷에 state가 없다, 처음부터 읽는다: {}", file);
                return null;
            }
            return n;
        } catch (IOException | RuntimeException e) {             // Jackson 3 파싱 오류는 비검사 예외다(ADR-012)
            log.warn("스냅샷을 못 읽어 처음부터 읽는다: {} ({})", file, e.toString());
            return null;
        }
    }

    /** tmp에 다 쓴 뒤 원자적으로 바꾼다. 실패하면 기존 스냅샷은 그대로 두고 경고만 남긴다. */
    void save(long offset, JsonNode state) {
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            ObjectNode n = MAPPER.createObjectNode();
            n.put("version", version);
            n.put("offset", offset);
            n.put("head", head(offset));
            n.set("state", state);
            Files.write(tmp, MAPPER.writeValueAsBytes(n));
            Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException | RuntimeException e) {
            log.warn("스냅샷을 못 썼다, 기존 것을 둔다: {} ({})", file, e.toString());
            try {
                Files.deleteIfExists(tmp);
            } catch (IOException ignored) {
                // tmp가 남아도 다음 저장이 덮는다
            }
        }
    }

    /**
     * 읽은 자리까지가 그때 그 원장인지 가르는 지문. 앞 4KB와 읽은 자리 바로 앞 4KB를 함께 해시한다.
     * 앞만 보면 같은 머리로 뒤를 갈아끼운 원장을 못 알아본다(PR #89 리뷰). 읽은 앞부분 전체를 해시하면
     * 기동 때 원장 전체를 다시 읽어 스냅샷의 이유가 사라진다. 원장은 API만 이어 쓰는 파일이라 두 창으로 충분하다.
     */
    private String head(long offset) throws IOException {
        int len = (int) Math.min(HEAD, offset);
        long tailStart = Math.max(0, offset - HEAD);
        int tailLen = (int) (offset - tailStart);
        byte[] first = new byte[len];
        byte[] tail = new byte[tailLen];
        if (offset > 0) {
            try (FileChannel ch = FileChannel.open(logPath, StandardOpenOption.READ)) {
                if (ch.size() < offset) return "short";
                if (ch.read(ByteBuffer.wrap(first), 0) != len) return "short";
                if (tailLen > 0 && ch.read(ByteBuffer.wrap(tail), tailStart) != tailLen) return "short";
            }
        }
        try {
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            d.update(first);
            d.update(tail);
            return HexFormat.of().formatHex(d.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
