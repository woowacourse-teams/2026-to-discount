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
}
