package com.discounttracker.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class InterProcessFileLockAuditTest {
    @TempDir Path temp;

    @Test
    void exclusiveLockCreatesMissingFileAndParents() throws Exception {
        Path lock = temp.resolve("sub/dir/a.lock");
        assertThat(InterProcessFileLock.withLock(lock, Duration.ofSeconds(1), () -> "ok")).isEqualTo("ok");
        assertThat(lock).exists();
    }

    @Test
    void operationsWriteRunsDirectlyWithoutEnv() throws Exception {
        if (System.getenv("OPERATIONS_BACKUP_LOCK") != null) return;
        assertThat(InterProcessFileLock.withOperationsWrite(() -> 7)).isEqualTo(7);
    }

    @Test
    void sharedLockWorksWhenFileIsMissing() throws Exception {
        Method m = InterProcessFileLock.class.getDeclaredMethod("withLock", Path.class, Duration.class,
                boolean.class, InterProcessFileLock.IOAction.class);
        m.setAccessible(true);
        Path lock = temp.resolve("ops.lock");
        assertThat(Files.exists(lock)).isFalse();
        InterProcessFileLock.IOAction<String> action = () -> "ok";
        assertThat(m.invoke(null, lock, Duration.ofSeconds(1), true, action)).isEqualTo("ok");
    }
}
