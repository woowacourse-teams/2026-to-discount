package com.discounttracker.storage;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 잠금 파일의 OS 락으로 프로세스 사이를 막는다(#192).
 *
 * <p>데이터 파일 자체에는 걸지 않는다. 데이터 파일은 {@code Files.move}로 교체되어 inode가
 * 바뀌므로 옛 inode의 락은 새 파일을 지키지 못한다. 같은 JVM의 두 스레드가
 * {@code FileChannel.lock()}을 부르면 {@code OverlappingFileLockException}이 나서, 경로별
 * {@link ReentrantLock}을 먼저 잡은 뒤 OS 락을 잡는다. 프로세스가 죽으면 OS가 락을 푼다.
 */
public final class InterProcessFileLock {

    @FunctionalInterface
    public interface IOAction<T> {
        T run() throws IOException;
    }

    private static final ConcurrentHashMap<Path, ReentrantLock> JVM_LOCKS = new ConcurrentHashMap<>();
    private static final long POLL_MILLIS = 20;

    private InterProcessFileLock() {}

    public static <T> T withLock(Path lockFile, Duration timeout, IOAction<T> action) throws IOException {
        Path key = lockFile.toAbsolutePath().normalize();
        if (key.getParent() != null) Files.createDirectories(key.getParent());
        long deadline = System.nanoTime() + timeout.toNanos();

        ReentrantLock jvmLock = JVM_LOCKS.computeIfAbsent(key, k -> new ReentrantLock());
        if (!tryJvm(jvmLock, timeout)) throw timedOut(key, timeout);
        try (FileChannel channel = FileChannel.open(key, StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
            FileLock os = null;
            while (os == null) {
                os = channel.tryLock();
                if (os != null) break;
                if (System.nanoTime() - deadline > 0) throw timedOut(key, timeout);
                sleep();
            }
            try {
                return action.run();
            } finally {
                os.release();
            }
        } finally {
            jvmLock.unlock();
        }
    }

    private static boolean tryJvm(ReentrantLock lock, Duration timeout) throws IOException {
        try {
            return lock.tryLock(timeout.toNanos(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("락 대기 중 인터럽트", e);
        }
    }

    private static void sleep() throws IOException {
        try {
            Thread.sleep(POLL_MILLIS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("락 대기 중 인터럽트", e);
        }
    }

    private static IOException timedOut(Path key, Duration timeout) {
        return new IOException("파일 락을 " + timeout.toMillis() + "ms 안에 잡지 못했다: " + key);
    }
}
