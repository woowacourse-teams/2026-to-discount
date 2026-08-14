package com.discounttracker.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 이벤트별 파일을 사용하는 영속 PostHog 전송 큐. */
@Component
public class PostHogOutbox {

    private static final Logger log = LoggerFactory.getLogger(PostHogOutbox.class);

    private final Path pendingDirectory;
    private final Path deadLetterDirectory;
    private final ObjectMapper mapper;
    private final Clock clock;

    public PostHogOutbox(PostHogProperties properties, ObjectMapper mapper, Clock clock) {
        this.pendingDirectory = properties.outboxPath().resolve("pending");
        this.deadLetterDirectory = properties.outboxPath().resolve("dead-letter");
        this.mapper = mapper;
        this.clock = clock;
        if (properties.enabled()) initialize();
    }

    private void initialize() {
        try {
            Files.createDirectories(pendingDirectory);
            Files.createDirectories(deadLetterDirectory);
            if (!Files.isWritable(pendingDirectory) || !Files.isWritable(deadLetterDirectory)) {
                throw new IllegalStateException("PostHog outbox 디렉터리에 쓸 수 없다");
            }
        } catch (IOException ex) {
            throw new IllegalStateException("PostHog outbox 디렉터리를 준비하지 못했다", ex);
        }
    }

    public void enqueue(String eventId, PostHogEvent event) {
        validateEventId(eventId);
        writeAtomically(pendingPath(eventId),
                PostHogDelivery.pending(eventId, event, clock.instant()));
    }

    /** due 항목의 시도 횟수와 다음 시각을 먼저 영속화한 뒤 반환한다. */
    public List<PostHogDelivery> claimDue(int limit) {
        if (limit < 1 || !Files.isDirectory(pendingDirectory)) return List.of();
        Instant now = clock.instant();
        List<PostHogDelivery> claimed = new ArrayList<>();

        for (Path path : pendingFiles()) {
            if (claimed.size() >= limit) break;
            PostHogDelivery delivery;
            try {
                delivery = mapper.readValue(path.toFile(), PostHogDelivery.class);
                validatePersistedDelivery(path, delivery);
            } catch (IOException ex) {
                quarantineCorrupt(path, ex);
                continue;
            } catch (IllegalArgumentException ex) {
                quarantineCorrupt(path, ex);
                continue;
            }
            if (!delivery.due(now)) continue;
            if (delivery.attemptCount() >= PostHogDelivery.MAX_ATTEMPTS) {
                moveToDeadLetter(delivery.failed(
                        "final attempt state recovered after process restart", now));
                continue;
            }
            PostHogDelivery updated = delivery.claim(now);
            writeAtomically(path, updated);
            claimed.add(updated);
        }
        return List.copyOf(claimed);
    }

    public void markSucceeded(List<PostHogDelivery> deliveries) {
        for (PostHogDelivery delivery : deliveries) {
            try {
                Files.deleteIfExists(pendingPath(delivery.eventId()));
            } catch (IOException ex) {
                throw new UncheckedIOException("PostHog pending 파일 삭제 실패", ex);
            }
        }
    }

    public void markFailed(List<PostHogDelivery> deliveries, String error) {
        Instant now = clock.instant();
        String safeError = abbreviate(error);
        for (PostHogDelivery delivery : deliveries) {
            PostHogDelivery failed = delivery.failed(safeError, now);
            if (failed.attemptCount() >= PostHogDelivery.MAX_ATTEMPTS) {
                moveToDeadLetter(failed);
            } else {
                writeAtomically(pendingPath(failed.eventId()), failed);
            }
        }
    }

    private List<Path> pendingFiles() {
        try (var files = Files.list(pendingDirectory)) {
            return files
                    .filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();
        } catch (IOException ex) {
            throw new UncheckedIOException("PostHog pending 디렉터리 조회 실패", ex);
        }
    }

    private void moveToDeadLetter(PostHogDelivery delivery) {
        Path deadLetter = deadLetterDirectory.resolve(delivery.eventId() + ".json");
        writeAtomically(deadLetter, delivery);
        try {
            Files.deleteIfExists(pendingPath(delivery.eventId()));
        } catch (IOException ex) {
            throw new UncheckedIOException("PostHog pending 파일 정리 실패", ex);
        }
    }

    private void quarantineCorrupt(Path path, Exception cause) {
        Path target = deadLetterDirectory.resolve(path.getFileName() + ".corrupt");
        log.error("깨진 PostHog pending 파일을 dead-letter로 이동한다: {}", path, cause);
        move(path, target);
    }

    private void writeAtomically(Path target, Object value) {
        Path temp = null;
        try {
            Files.createDirectories(target.getParent());
            temp = Files.createTempFile(target.getParent(), "posthog-", ".tmp");
            mapper.writeValue(temp.toFile(), value);
            move(temp, target);
        } catch (IOException ex) {
            throw new UncheckedIOException("PostHog outbox 기록 실패: " + target, ex);
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // 다음 쓰기와 무관한 임시 파일이므로 운영 점검에서 정리한다.
                }
            }
        }
    }

    private static void move(Path source, Path target) {
        try {
            try {
                Files.move(source, target, StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("PostHog outbox 파일 이동 실패", ex);
        }
    }

    private Path pendingPath(String eventId) {
        return pendingDirectory.resolve(eventId + ".json");
    }

    private static void validateEventId(String eventId) {
        if (eventId == null || !eventId.matches("[A-Za-z0-9_-]{1,80}")) {
            throw new IllegalArgumentException("안전하지 않은 PostHog eventId");
        }
    }

    private void validatePersistedDelivery(Path path, PostHogDelivery delivery) {
        if (delivery == null || delivery.payload() == null) {
            throw new IllegalArgumentException("payload가 없는 PostHog delivery");
        }
        validateEventId(delivery.eventId());
        if (!path.getFileName().toString().equals(delivery.eventId() + ".json")) {
            throw new IllegalArgumentException("파일명과 eventId가 다른 PostHog delivery");
        }
    }

    private static String abbreviate(String error) {
        if (error == null || error.isBlank()) return "unknown PostHog delivery failure";
        return error.length() <= 500 ? error : error.substring(0, 500);
    }
}
