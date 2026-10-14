package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;

/**
 * 방문 이벤트를 JSONL로 append한다.
 *
 * <p>DB를 두지 않는다 — 원장(log.jsonl)과 같은 방식이라 도구가 하나로 통일되고,
 * 이 규모에서는 {@code jq} 한 줄이면 집계가 끝난다. 한 줄이 곧 이벤트 하나라
 * 중간에 프로세스가 죽어도 그 줄까지는 온전하다.
 */
@Component
public class EventLog {

    private final Path path;
    private final ObjectMapper mapper;

    public EventLog(@Value("${discount.event-log-path:data/events.jsonl}") String path,
                    ObjectMapper mapper) {
        this.path = Path.of(path);
        this.mapper = mapper;
    }

    /** 배치를 한 번에 쓴다. 호출이 겹쳐도 줄이 섞이지 않도록 직렬화한다. */
    public synchronized void append(List<VisitEvent> events) {
        if (events.isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        for (VisitEvent e : events) {
            try {
                sb.append(mapper.writeValueAsString(e)).append('\n');
            } catch (IOException ex) {
                throw new UncheckedIOException("이벤트 직렬화 실패", ex);
            }
        }
        try {
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            Files.writeString(path, sb.toString(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ex) {
            throw new UncheckedIOException("이벤트 기록 실패: " + path, ex);
        }
    }

    Path path() {
        return path;
    }

    /**
     * {@code offset}(바이트)부터 끝까지, 줄바꿈으로 끝난 온전한 줄만 넘기고 다음에 읽을 자리를 돌려준다.
     *
     * <p>읽는 쪽(설문 판정, 인기)이 자리를 기억하고 새로 붙은 줄만 읽게 하려고 있다. 예전엔 요청마다
     * 파일 전체를 다시 훑었다 - 2026-10-14 원장 177MB, 34만 줄에서 설문 판정 한 번이 1.9초, 인기
     * 재계산이 10분마다 한 요청을 2초 붙잡았다. 쓰는 중인 마지막 줄은 줄바꿈이 없으니 다음 번에 읽는다.
     *
     * @return 다음 자리. 파일이 없으면 {@code offset} 그대로. 파일이 {@code offset}보다 짧아졌으면
     *         (갈아끼웠다) {@code -1} - 읽는 쪽이 집계를 비우고 0부터 다시 읽는다
     */
    long readFrom(long offset, java.util.function.Consumer<String> sink) throws IOException {
        if (!Files.exists(path)) return offset;
        try (java.nio.channels.FileChannel ch = java.nio.channels.FileChannel.open(path, StandardOpenOption.READ)) {
            if (ch.size() < offset) return -1;
            ch.position(offset);
            java.io.InputStream in = java.nio.channels.Channels.newInputStream(ch);
            // 한 바이트씩 읽으면 177MB에 20초가 걸렸다(2026-10-14 로컬). 덩어리로 읽고 줄바꿈만 찾는다.
            byte[] chunk = new byte[1 << 16];
            java.io.ByteArrayOutputStream line = new java.io.ByteArrayOutputStream(512);
            long next = offset;
            int n;
            while ((n = in.read(chunk)) > 0) {
                int start = 0;
                for (int i = 0; i < n; i++) {
                    if (chunk[i] != '\n') continue;
                    line.write(chunk, start, i - start);
                    next += line.size() + 1;
                    sink.accept(line.toString(StandardCharsets.UTF_8));
                    line.reset();
                    start = i + 1;
                }
                line.write(chunk, start, n - start);
            }
            return next;
        }
    }
}
