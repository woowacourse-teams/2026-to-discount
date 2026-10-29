package com.discounttracker.analytics;

import com.discounttracker.storage.InterProcessFileLock;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GifticonStoreTest {

    @TempDir Path tmp;

    private GifticonStore store(String yaml) throws Exception {
        Path p = tmp.resolve("gifticons.yml");
        Files.writeString(p, yaml, StandardCharsets.UTF_8);
        return new GifticonStore(p.toString());
    }

    @Test
    void issuesCodeAndMarksIt() throws Exception {
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
            """);

        assertEquals(1, s.remaining());
        assertEquals(Optional.of("AAAA-1111"), s.issue("v_1"));
        assertEquals(0, s.remaining(), "발급한 코드는 더 이상 남은 것이 아니다");
        assertTrue(Files.readString(s.path()).contains("v_1"), "발급 기록이 파일에 남아야 한다");
    }

    @Test
    void sameVisitorGetsTheSameCodeBackInsteadOfANewOne() throws Exception {
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
              - code: "BBBB-2222"
            """);

        assertEquals(Optional.of("AAAA-1111"), s.issue("v_1"));
        assertEquals(Optional.of("AAAA-1111"), s.issue("v_1"),
                "이미 받은 사람에게는 그때 그 코드를 준다");
        assertEquals(1, s.remaining(), "재고를 두 번 먹으면 안 된다");
        assertEquals(Optional.of("AAAA-1111"), s.issuedTo("v_1"));
        assertEquals(Optional.empty(), s.issuedTo("v_2"));
    }

    @Test
    void issuanceIsAlsoWrittenToAnAppendOnlyLedger() throws Exception {
        // gifticons.yml은 제자리에서 다시 쓰이는 파일이라 통째로 갈리면
        // 누가 무엇을 받았는지가 함께 사라진다 — 2026-09-02에 실제로 그렇게
        // 날아가 같은 링크가 두 사람에게 나갔다.
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
            """);
        s.issue("v_1");

        String ledger = Files.readString(tmp.resolve("gifticon-issues.jsonl"));
        assertTrue(ledger.contains("v_1"), ledger);
        assertTrue(ledger.contains("AAAA-1111"), ledger);
    }

    @Test
    void neverIssuesTheSameCodeTwice() throws Exception {
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
              - code: "BBBB-2222"
            """);

        assertEquals(Optional.of("AAAA-1111"), s.issue("v_1"));
        assertEquals(Optional.of("BBBB-2222"), s.issue("v_2"));
        assertEquals(Optional.empty(), s.issue("v_3"), "소진되면 빈 값");
    }

    /** 파일이 없으면 설문이 자동으로 내려가야 한다 — 오류가 아니다. */
    @Test
    void missingFileHasNoneRemaining() {
        GifticonStore s = new GifticonStore(tmp.resolve("없는파일.yml").toString());

        assertEquals(0, s.remaining());
        assertEquals(Optional.empty(), s.issue("v_1"));
    }

    /** 락을 못 잡으면 코드를 내주지 않고 yml과 원장도 그대로여야 한다(#192). 락 없이 발급으로 떨어지면 이중 발급이다. */
    @Test
    void doesNotIssueWhenTheLockCannotBeTaken() throws Exception {
        String yaml = """
            gifticons:
              - code: "AAAA-1111"
            """;
        Path yml = tmp.resolve("gifticons.yml");
        Files.writeString(yml, yaml, StandardCharsets.UTF_8);
        GifticonStore s = new GifticonStore(yml.toString(), Duration.ofMillis(200));

        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try {
                InterProcessFileLock.withLock(tmp.resolve("gifticons.yml.lock"), Duration.ofSeconds(5), () -> {
                    held.countDown();
                    try {
                        release.await(10, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                    return null;
                });
            } catch (java.io.IOException e) {
                throw new java.io.UncheckedIOException(e);
            }
        });
        holder.start();
        try {
            assertTrue(held.await(5, TimeUnit.SECONDS), "락을 쥔 쪽이 먼저 떠야 시험이 된다");

            assertEquals(Optional.empty(), s.issue("v_1"));
        } finally {
            release.countDown();
            holder.join(5000);
        }

        assertEquals(yaml, Files.readString(yml), "yml이 그대로여야 한다");
        assertTrue(Files.notExists(tmp.resolve("gifticon-issues.jsonl")), "원장에도 남으면 안 된다");
        assertEquals(Optional.of("AAAA-1111"), s.issue("v_1"), "락이 풀리면 정상 발급");
    }

    /** 동시에 들어와도 코드가 두 번 나가면 안 된다. */
    @Test
    void concurrentIssuesNeverOverlap() throws Exception {
        GifticonStore s = store("""
            gifticons:
              - code: "AAAA-1111"
              - code: "BBBB-2222"
              - code: "CCCC-3333"
            """);

        int threads = 8;
        CountDownLatch go = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        Set<String> issued = Collections.newSetFromMap(new ConcurrentHashMap<>());
        List<Thread> ts = java.util.stream.IntStream.range(0, threads)
                .mapToObj(i -> new Thread(() -> {
                    try {
                        go.await();
                        s.issue("v_" + i).ifPresent(code -> assertTrue(issued.add(code),
                                "같은 코드가 두 번 나갔다: " + code));
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                }))
                .toList();
        ts.forEach(Thread::start);
        go.countDown();
        assertTrue(done.await(10, TimeUnit.SECONDS));

        assertEquals(3, issued.size(), "코드 세 개가 서로 다른 사람에게 하나씩");
        assertEquals(0, s.remaining());
    }
}
