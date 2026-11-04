package com.discounttracker.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InterProcessFileLockTest {
    @TempDir Path temp;

    @Test
    void twoThreadsEnterOneAtATime() throws Exception {
        Path lock = temp.resolve("a.lock");
        AtomicInteger inside = new AtomicInteger();
        AtomicInteger maxInside = new AtomicInteger();
        Runnable job = () -> {
            try {
                for (int i = 0; i < 20; i++) {
                    InterProcessFileLock.withLock(lock, Duration.ofSeconds(5), () -> {
                        maxInside.accumulateAndGet(inside.incrementAndGet(), Math::max);
                        try {
                            Thread.sleep(2);
                        } catch (InterruptedException e) {
                            throw new IOException(e);
                        }
                        inside.decrementAndGet();
                        return null;
                    });
                }
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        };
        Thread a = new Thread(job);
        Thread b = new Thread(job);
        a.start();
        b.start();
        a.join();
        b.join();
        assertThat(maxInside.get()).isEqualTo(1);
    }

    @Test
    void givesUpAfterTimeoutAndReleasesAfterException() throws Exception {
        Path lock = temp.resolve("b.lock");
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try {
                InterProcessFileLock.withLock(lock, Duration.ofSeconds(5), () -> {
                    held.countDown();
                    try {
                        release.await();
                    } catch (InterruptedException e) {
                        throw new IOException(e);
                    }
                    return null;
                });
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        });
        holder.start();
        held.await();
        assertThatThrownBy(() -> InterProcessFileLock.withLock(lock, Duration.ofMillis(200), () -> null))
                .isInstanceOf(IOException.class);
        release.countDown();
        holder.join();

        assertThatThrownBy(() -> InterProcessFileLock.withLock(lock, Duration.ofSeconds(1), () -> {
            throw new IOException("boom");
        })).hasMessage("boom");
        assertThat(InterProcessFileLock.withLock(lock, Duration.ofSeconds(1), () -> "ok")).isEqualTo("ok");
    }
}
