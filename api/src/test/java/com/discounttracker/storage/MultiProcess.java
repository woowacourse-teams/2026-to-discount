package com.discounttracker.storage;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** 자식 JVM 여러 개를 동시에 출발시킨다. 같은 JVM의 스레드는 프로세스 사이가 아니라서 쓰지 않는다. */
final class MultiProcess {
    private MultiProcess() {}

    static void run(String kind, Path data, Path dir, int workers, int count) throws Exception {
        Path go = dir.resolve("go.signal");
        String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        List<Process> procs = new ArrayList<>();
        for (int w = 0; w < workers; w++) {
            procs.add(new ProcessBuilder(java, "-cp", System.getProperty("java.class.path"),
                    StoreWorker.class.getName(), kind, data.toString(), go.toString(),
                    String.valueOf(w), String.valueOf(count))
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD).start());
        }
        Thread.sleep(1500); // 자식이 다 떠서 신호를 기다리는 상태가 되도록
        Files.writeString(go, "go");
        for (Process p : procs) {
            if (!p.waitFor(120, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new AssertionError("자식 프로세스가 끝나지 않았다");
            }
            if (p.exitValue() != 0) throw new AssertionError("자식 프로세스 종료 코드 " + p.exitValue());
        }
    }
}
