package com.discounttracker.storage;

import com.discounttracker.analytics.GifticonStore;
import com.discounttracker.push.PushProperties;
import com.discounttracker.push.PushStateStore;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;

/**
 * 다중 프로세스 시험이 자식 JVM으로 띄우는 일꾼. 인자: 종류(gifticon|push) 데이터경로 시작신호파일 일꾼번호 횟수.
 * 신호 파일이 생길 때까지 기다렸다 한꺼번에 출발한다. 결과는 종료 코드(0이면 정상).
 */
public final class StoreWorker {
    public static void main(String[] args) throws Exception {
        String kind = args[0];
        Path data = Path.of(args[1]);
        Path go = Path.of(args[2]);
        int worker = Integer.parseInt(args[3]);
        int count = Integer.parseInt(args[4]);
        while (!Files.exists(go)) Thread.sleep(5);

        if (kind.equals("gifticon")) {
            GifticonStore store = new GifticonStore(data.toString());
            for (int i = 0; i < count; i++) {
                if (store.issue("v" + worker + "-" + i).isEmpty()) System.exit(2);
            }
        } else {
            PushProperties props = new PushProperties(false, "", "", "mailto:t@example.com", data,
                    "https://front.example/", "https://api.example");
            PushStateStore store = new PushStateStore(props, new ObjectMapper(), Clock.systemUTC());
            for (int i = 0; i < count; i++) {
                String id = worker + "-" + i;
                store.upsert("https://fcm.googleapis.com/" + id, "k", "a", "v" + id, true);
                store.markDelivered("key:" + id);
                store.createToken("n" + id, "s", List.of("b"), "digest");
            }
        }
    }
}
